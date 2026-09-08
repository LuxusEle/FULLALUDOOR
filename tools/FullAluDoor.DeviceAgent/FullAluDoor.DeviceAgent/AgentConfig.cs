// Runtime configuration for the agent's tiny localhost surface.
//
// Config file locations (JSON, UTF-8):
//   machine: %ProgramData%\FullAluDoor Device Agent\config.json  (admin managed)
//   user:    %LocalAppData%\FullAluDoor Device Agent\config.json (user override)
//
// The allowed-origin list is the primary authorization control for the local
// API. Only the FullAluDoor application origin(s) listed here may request
// signatures. Command line switches override only the port (never broaden the
// origin list).

using System.Text.Json;
using System.Text.Json.Serialization;

namespace FullAluDoor.DeviceAgent;

public sealed class AgentConfig
{
    public const string FileName = "config.json";

    public int Port { get; set; } = AgentConstants.DefaultPort;

    /// <summary>Comma separated list of exact origins allowed to call the agent.</summary>
    public string AllowedOrigins { get; set; } = AgentConstants.AllowedOriginDevelopmentDefault;

    public int MaxSignPerWindow { get; set; } = AgentConstants.DefaultMaxSignPerWindow;

    public int RateWindowSeconds { get; set; } = AgentConstants.DefaultRateWindowSeconds;

    [JsonIgnore]
    public IReadOnlyList<string> AllowedOriginList =>
        AllowedOrigins
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(IsValidOrigin)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

    public static bool IsValidOrigin(string origin)
    {
        return Uri.TryCreate(origin, UriKind.Absolute, out var uri)
            && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps)
            && !string.IsNullOrEmpty(uri.Host);
    }
}

public static class AgentConfigLoader
{
    public static string MachineDirectory() =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "FullAluDoor Device Agent");

    public static string UserDirectory() =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FullAluDoor Device Agent");

    public static AgentConfig Load(int? cliPort)
    {
        var config = new AgentConfig();

        // Machine defaults first, then a user override on top.
        TryApply(Path.Combine(MachineDirectory(), AgentConfig.FileName), config);
        TryApply(Path.Combine(UserDirectory(), AgentConfig.FileName), config);

        if (cliPort is > 0 and <= 65535)
        {
            config.Port = cliPort.Value;
        }

        if (!config.AllowedOriginList.Any())
        {
            // Never run with an empty allow-list: fall back to the safe dev set.
            config.AllowedOrigins = AgentConstants.AllowedOriginDevelopmentDefault;
        }

        return config;
    }

    private static void TryApply(string path, AgentConfig target)
    {
        try
        {
            if (!File.Exists(path)) return;
            var json = File.ReadAllText(path);
            var loaded = JsonSerializer.Deserialize<AgentConfig>(json, JsonOptions());
            if (loaded is null) return;
            if (loaded.Port is > 0 and <= 65535) target.Port = loaded.Port;
            if (!string.IsNullOrWhiteSpace(loaded.AllowedOrigins)) target.AllowedOrigins = loaded.AllowedOrigins;
            if (loaded.MaxSignPerWindow > 0) target.MaxSignPerWindow = loaded.MaxSignPerWindow;
            if (loaded.RateWindowSeconds > 0) target.RateWindowSeconds = loaded.RateWindowSeconds;
        }
        catch
        {
            // A broken config file must fail closed with defaults, never crash.
        }
    }

    public static JsonSerializerOptions JsonOptions()
    {
        return new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
            WriteIndented = true,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        };
    }
}
