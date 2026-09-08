// Persistent, cryptographically-random device identity for this Windows
// computer. The device_id is a random UUID (never derived from MAC/CPU/board
// serials, computer name, IP or the Windows user). Hardware strings are never
// used as the authorization boundary.

using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace FullAluDoor.DeviceAgent.DeviceIdentity;

public sealed record WindowsDevice(
    string DeviceId,
    string DeviceName,
    string PublicKey,
    string KeyAlgorithm,
    string Platform,
    string OsVersion,
    string AgentVersion,
    string Scope,
    string CreatedAt);

internal sealed class IdentityFileDto
{
    [JsonPropertyName("deviceId")] public string DeviceId { get; set; } = "";
    [JsonPropertyName("deviceName")] public string DeviceName { get; set; } = "";
    [JsonPropertyName("publicKey")] public string PublicKey { get; set; } = "";
    [JsonPropertyName("keyAlgorithm")] public string KeyAlgorithm { get; set; } = "";
    [JsonPropertyName("platform")] public string Platform { get; set; } = "";
    [JsonPropertyName("osVersion")] public string OsVersion { get; set; } = "";
    [JsonPropertyName("agentVersion")] public string AgentVersion { get; set; } = "";
    [JsonPropertyName("scope")] public string Scope { get; set; } = "user";
    [JsonPropertyName("createdAt")] public string CreatedAt { get; set; } = "";
}
