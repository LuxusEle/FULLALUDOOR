// Purpose-built localhost API for the Windows Device Agent.
//
// Surface (and nothing else):
//   GET  /health        -> status + version + device id
//   GET  /device/info   -> public device identity (never the private key)
//   POST /device/sign   -> sign a canonical server challenge
//
// Security posture:
//   * binds ONLY to loopback (127.0.0.1 + ::1) via Kestrel ListenLocalhost
//   * every non-health request must carry an Origin in the configured allow-list
//   * bounded request bodies (<= 4 KiB)
//   * rate limited signing
//   * the agent signs ONLY well-formed canonical messages that begin with its
//     own device_id (never arbitrary text)
//   * no shell/command/file/upload/download/remote-admin endpoints exist

using System.Text.Json;
using FullAluDoor.DeviceAgent.DeviceIdentity;
using FullAluDoor.DeviceAgent.Security;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace FullAluDoor.DeviceAgent.Api;

public sealed class AgentApi : IAsyncDisposable
{
    private readonly WindowsDevice _identity;
    private readonly Ed25519KeyPair _keyPair;
    private readonly AgentConfig _config;
    private readonly RateLimiter _signLimiter;
    private readonly object _signLock = new();
    private WebApplication? _app;

    public AgentApi(WindowsDevice identity, Ed25519KeyPair keyPair, AgentConfig config)
    {
        _identity = identity;
        _keyPair = keyPair;
        _config = config;
        _signLimiter = new RateLimiter(config.MaxSignPerWindow, config.RateWindowSeconds);
    }

    public string BaseUrl => $"http://127.0.0.1:{_config.Port}";

    public async Task StartAsync(string[] args)
    {
        var builder = WebApplication.CreateSlimBuilder(args);
        builder.Logging.SetMinimumLevel(LogLevel.Warning);

        builder.WebHost.ConfigureKestrel(options =>
        {
            options.ListenLocalhost(_config.Port);
            options.Limits.MaxRequestBodySize = 4096;
            options.Limits.MaxRequestHeadersTotalSize = 16 * 1024;
        });

        var app = builder.Build();

        // Origin allow-list gate for all non-health traffic.
        app.Use(async (context, next) =>
        {
            string path = context.Request.Path.Value ?? "";
            string? origin = context.Request.Headers.Origin.FirstOrDefault();

            if (HttpMethods.IsOptions(context.Request.Method))
            {
                if (!IsOriginAllowed(origin))
                {
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    await context.Response.WriteAsync("{\"error\":\"origin_not_allowed\"}");
                    return;
                }
                ApplyCorsHeaders(context.Response, origin!);
                context.Response.StatusCode = StatusCodes.Status204NoContent;
                return;
            }

            if (path is not ("/health" or "/health/"))
            {
                if (string.IsNullOrEmpty(origin) || !IsOriginAllowed(origin))
                {
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    context.Response.ContentType = "application/json";
                    await context.Response.WriteAsync("{\"error\":\"origin_not_allowed\"}");
                    return;
                }
            }

            ApplyCorsHeaders(context.Response, origin);
            await next();
        });

        app.MapGet("/health", () => Results.Json(new
        {
            status = "ok",
            version = AgentVersionProvider.Current,
            deviceId = _identity.DeviceId,
        }));

        app.MapGet("/device/info", () => Results.Json(PublicInfo()));

        app.MapPost("/device/sign", async (HttpContext context) =>
        {
            string clientKey = context.Connection.RemoteIpAddress?.ToString() ?? "loopback";
            if (!_signLimiter.TryAcquire(clientKey))
            {
                context.Response.StatusCode = StatusCodes.Status429TooManyRequests;
                await context.Response.WriteAsync("{\"error\":\"rate_limited\"}");
                return;
            }

            SignRequest? request;
            try
            {
                request = await context.Request.ReadFromJsonAsync<SignRequest>();
            }
            catch (JsonException)
            {
                context.Response.StatusCode = StatusCodes.Status400BadRequest;
                await context.Response.WriteAsync("{\"error\":\"invalid_json\"}");
                return;
            }

            if (request is null || string.IsNullOrWhiteSpace(request.Challenge))
            {
                context.Response.StatusCode = StatusCodes.Status400BadRequest;
                await context.Response.WriteAsync("{\"error\":\"challenge_required\"}");
                return;
            }

            if (request.Challenge.Length > AgentConstants.MaxChallengeBytes)
            {
                context.Response.StatusCode = StatusCodes.Status413PayloadTooLarge;
                await context.Response.WriteAsync("{\"error\":\"challenge_too_large\"}");
                return;
            }

            if (!AttestationProtocol.IsWellFormedMessage(request.Challenge))
            {
                context.Response.StatusCode = StatusCodes.Status400BadRequest;
                await context.Response.WriteAsync("{\"error\":\"malformed_challenge\"}");
                return;
            }

            if (!AttestationProtocol.BelongsToDevice(request.Challenge, _identity.DeviceId))
            {
                // Never sign a challenge addressed to another device identity.
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                await context.Response.WriteAsync("{\"error\":\"challenge_device_mismatch\"}");
                return;
            }

            byte[] message = System.Text.Encoding.UTF8.GetBytes(request.Challenge);
            byte[] signature;
            lock (_signLock)
            {
                signature = _keyPair.Sign(message);
            }

            await context.Response.WriteAsJsonAsync(new
            {
                deviceId = _identity.DeviceId,
                publicKey = _identity.PublicKey,
                keyAlgorithm = _identity.KeyAlgorithm,
                signature = Base64Url.Encode(signature),
                signedAt = DateTimeOffset.UtcNow.ToString("o"),
            });
        });

        await app.StartAsync();
        _app = app;
    }

    public object PublicInfo()
    {
        return new
        {
            deviceId = _identity.DeviceId,
            deviceName = _identity.DeviceName,
            publicKey = _identity.PublicKey,
            keyAlgorithm = _identity.KeyAlgorithm,
            platform = _identity.Platform,
            osVersion = _identity.OsVersion,
            agentVersion = _identity.AgentVersion,
            scope = _identity.Scope,
        };
    }

    private bool IsOriginAllowed(string? origin)
    {
        if (string.IsNullOrEmpty(origin)) return false;
        return _config.AllowedOriginList.Contains(origin, StringComparer.OrdinalIgnoreCase);
    }

    private static void ApplyCorsHeaders(HttpResponse response, string? origin)
    {
        response.Headers["Access-Control-Allow-Origin"] = origin;
        response.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
        response.Headers["Access-Control-Allow-Headers"] = "content-type, accept";
        response.Headers["Access-Control-Max-Age"] = "600";
        response.Headers["Access-Control-Allow-Private-Network"] = "true";
        response.Headers["Vary"] = "Origin";
        response.Headers["X-Content-Type-Options"] = "nosniff";
    }

    public async ValueTask DisposeAsync()
    {
        if (_app is not null)
        {
            await _app.StopAsync();
            await _app.DisposeAsync();
            _app = null;
        }
        _keyPair.Dispose();
    }

    private sealed class SignRequest
    {
        public string? Challenge { get; set; }
    }
}
