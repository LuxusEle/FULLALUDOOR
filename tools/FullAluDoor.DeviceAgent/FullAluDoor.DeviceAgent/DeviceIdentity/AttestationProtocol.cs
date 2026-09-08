// Validates the canonical attestation message the agent is asked to sign.
// Mirrors the browser helper (device-attestation.ts) and the SQL helper
// (device_attestation_message). The agent only signs messages of exactly this
// shape AND only those that start with its own device_id.

using System.Text.RegularExpressions;

namespace FullAluDoor.DeviceAgent.DeviceIdentity;

public static partial class AttestationProtocol
{
    [GeneratedRegex(@"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", RegexOptions.IgnoreCase)]
    private static partial Regex DeviceIdRegex();

    [GeneratedRegex(@"^[A-Za-z0-9_-]+$")]
    private static partial Regex Base64UrlRegex();

    public static bool IsValidDeviceId(string deviceId)
    {
        return !string.IsNullOrEmpty(deviceId) && DeviceIdRegex().IsMatch(deviceId);
    }

    /// <summary>Validates the canonical &lt;device&gt;.&lt;challenge&gt;.&lt;nonce&gt; shape.</summary>
    public static bool IsWellFormedMessage(string message)
    {
        if (string.IsNullOrEmpty(message) || message.Length > 220) return false;
        string[] parts = message.Split('.');
        if (parts.Length != 3) return false;

        if (!IsValidDeviceId(parts[0])) return false;
        if (!DeviceIdRegex().IsMatch(parts[1])) return false;
        if (parts[2].Length < 20 || !Base64UrlRegex().IsMatch(parts[2])) return false;
        return true;
    }

    /// <summary>Returns the embedded device_id when the message is well formed.</summary>
    public static bool TryParseDeviceId(string message, out string deviceId)
    {
        deviceId = "";
        if (!IsWellFormedMessage(message)) return false;
        deviceId = message.Split('.')[0];
        return true;
    }

    /// <summary>The agent signs only messages bound to its OWN device identity.</summary>
    public static bool BelongsToDevice(string message, string ownDeviceId)
    {
        return TryParseDeviceId(message, out string embedded)
            && string.Equals(embedded, ownDeviceId, StringComparison.OrdinalIgnoreCase);
    }
}
