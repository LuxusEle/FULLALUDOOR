// Shared constants + small conversion helpers for the agent.
// The wire format must stay in lock-step with the browser (device-agent-client)
// and PostgreSQL (device_b64url_* helpers).

namespace FullAluDoor.DeviceAgent;

public static class AgentConstants
{
    public const string KeyAlgorithm = "Ed25519";
    public const string DefaultAgentOrigin = "http://127.0.0.1:8750";
    public const int DefaultPort = 8750;
    public const int DefaultMaxSignPerWindow = 30;
    public const int DefaultRateWindowSeconds = 10;
    public const int MaxChallengeBytes = 512;
    public const string DefaultDeviceName = "Windows computer";

    // Scheme prefixes for the canonical attestation message: device.challenge.nonce
    public const string AllowedOriginDevelopmentDefault =
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:9898,http://127.0.0.1:9898";
}

public static class Base64Url
{
    public static string Encode(ReadOnlySpan<byte> bytes)
    {
        return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    public static byte[] Decode(string value)
    {
        string normalized = value.Replace('-', '+').Replace('_', '/');
        int padding = (4 - (normalized.Length % 4)) % 4;
        if (padding > 0) normalized += new string('=', padding);
        return Convert.FromBase64String(normalized);
    }
}
