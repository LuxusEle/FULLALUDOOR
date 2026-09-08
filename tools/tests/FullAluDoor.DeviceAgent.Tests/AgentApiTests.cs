using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using FullAluDoor.DeviceAgent.Api;
using FullAluDoor.DeviceAgent.DeviceIdentity;
using Xunit;

namespace FullAluDoor.DeviceAgent.Tests;

public class AgentApiTests : IAsyncLifetime
{
    private string _dir = null!;
    private int _port;
    private DeviceIdentityStore _store = null!;
    private WindowsDevice _identity = null!;
    private Security.Ed25519KeyPair _key = null!;
    private AgentApi _api = null!;
    private HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        _dir = Path.Combine(Path.GetTempPath(), "fad-agent-api", Guid.NewGuid().ToString("N"));
        _store = new DeviceIdentityStore(_dir);
        _identity = _store.EnrollNew(out _key);

        _port = GetFreePort();
        var config = new AgentConfig
        {
            Port = _port,
            AllowedOrigins = "http://localhost:3000,http://localhost:9898",
        };
        _api = new AgentApi(_identity, _key, config);
        await _api.StartAsync(Array.Empty<string>());

        _client = new HttpClient { BaseAddress = new Uri($"http://127.0.0.1:{_port}") };
    }

    private static int GetFreePort()
    {
        var listener = new System.Net.Sockets.TcpListener(System.Net.IPAddress.Loopback, 0);
        listener.Start();
        int port = ((System.Net.IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return port;
    }

    [Fact]
    public async Task Health_Works_Without_Origin()
    {
        using var response = await _client.GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var node = JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
        Assert.Equal("ok", (string?)node["status"]);
        Assert.Equal(_identity.DeviceId, (string?)node["deviceId"]);
    }

    [Fact]
    public async Task DeviceInfo_Returns_Public_Identity_For_Allowed_Origin()
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/device/info");
        request.Headers.Add("Origin", "http://localhost:3000");
        using var response = await _client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var node = JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
        Assert.Equal(_identity.DeviceId, (string?)node["deviceId"]);
        Assert.Equal(_identity.PublicKey, (string?)node["publicKey"]);
        Assert.Equal("Ed25519", (string?)node["keyAlgorithm"]);
        Assert.DoesNotContain("signature", node.ToJsonString());
    }

    [Fact]
    public async Task DeviceInfo_Rejects_Unknown_Origin()
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/device/info");
        request.Headers.Add("Origin", "https://evil.example");
        using var response = await _client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task DeviceInfo_Rejects_Missing_Origin()
    {
        using var response = await _client.GetAsync("/device/info");
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Sign_Returns_Verifiable_Signature_For_Own_Device()
    {
        string message = $"{_identity.DeviceId}.{Guid.NewGuid():D}.AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-";
        using var request = new HttpRequestMessage(HttpMethod.Post, "/device/sign")
        {
            Content = JsonContent.Create(new { challenge = message }),
        };
        request.Headers.Add("Origin", "http://localhost:3000");

        using var response = await _client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        string signatureB64 = doc.RootElement.GetProperty("signature").GetString()!;
        byte[] signature = Base64Url.Decode(signatureB64);
        byte[] signed = System.Text.Encoding.UTF8.GetBytes(message);

        // The signature MUST verify against the agent's public key.
        Assert.True(_key.Verify(signed, signature));
        Assert.Equal(_identity.DeviceId, doc.RootElement.GetProperty("deviceId").GetString());
    }

    [Fact]
    public async Task Sign_Rejects_NonCanonical_Challenge()
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/device/sign")
        {
            Content = JsonContent.Create(new { challenge = "not a canonical challenge" }),
        };
        request.Headers.Add("Origin", "http://localhost:3000");
        using var response = await _client.SendAsync(request);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Sign_Rejects_Challenge_For_Another_Device()
    {
        string otherDevice = Guid.NewGuid().ToString("D");
        string message = $"{otherDevice}.{Guid.NewGuid():D}.AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-";
        using var request = new HttpRequestMessage(HttpMethod.Post, "/device/sign")
        {
            Content = JsonContent.Create(new { challenge = message }),
        };
        request.Headers.Add("Origin", "http://localhost:3000");
        using var response = await _client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Sign_Rejects_Disallowed_Origin()
    {
        string message = $"{_identity.DeviceId}.{Guid.NewGuid():D}.AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-";
        using var request = new HttpRequestMessage(HttpMethod.Post, "/device/sign")
        {
            Content = JsonContent.Create(new { challenge = message }),
        };
        request.Headers.Add("Origin", "https://attacker.example");
        using var response = await _client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Sign_Rejects_Oversized_Challenge()
    {
        string big = new string('A', 10_000);
        using var request = new HttpRequestMessage(HttpMethod.Post, "/device/sign")
        {
            Content = JsonContent.Create(new { challenge = big }),
        };
        request.Headers.Add("Origin", "http://localhost:3000");
        using var response = await _client.SendAsync(request);
        Assert.True(response.StatusCode == HttpStatusCode.RequestEntityTooLarge || response.StatusCode == HttpStatusCode.BadRequest);
    }

    public async Task DisposeAsync()
    {
        _client?.Dispose();
        if (_api is not null) await _api.DisposeAsync();
        _key?.Dispose();
        try { Directory.Delete(_dir, recursive: true); } catch { }
    }
}
