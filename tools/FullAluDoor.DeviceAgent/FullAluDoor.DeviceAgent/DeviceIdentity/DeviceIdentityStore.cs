// Loads/creates the device identity and its DPAPI-protected Ed25519 key.
//
// Storage layout (scope chosen at first run):
//   machine: %ProgramData%\FullAluDoor Device Agent\identity.json + key.bin
//   user:    %LocalAppData%\FullAluDoor Device Agent\identity.json + key.bin
//
// The machine scope is used when the process can write to ProgramData (e.g.
// installed/admin). Otherwise a per-Windows-user store is used, which still
// satisfies the core requirement: every browser run by the same Windows user
// on this computer shares one device identity.

using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;
using FullAluDoor.DeviceAgent.Security;

namespace FullAluDoor.DeviceAgent.DeviceIdentity;

public sealed class DeviceIdentityStore
{
    private const string IdentityFile = "identity.json";
    private const string KeyFile = "key.bin";
    private readonly string _directory;
    private readonly string _identityPath;
    private readonly string _keyPath;

    public DeviceIdentityStore(string? overrideDirectory = null)
    {
        _directory = overrideDirectory ?? SelectDirectory(out _);
        _identityPath = Path.Combine(_directory, IdentityFile);
        _keyPath = Path.Combine(_directory, KeyFile);
    }

    public string DirectoryPath => _directory;

    public static string SelectDirectory(out bool machineScope)
    {
        string env = Environment.GetEnvironmentVariable("FULLALUDOOR_DEVICE_STORAGE") ?? "";
        if (!string.IsNullOrWhiteSpace(env))
        {
            machineScope = false;
            return env;
        }

        string programData = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "FullAluDoor Device Agent");
        try
        {
            Directory.CreateDirectory(programData);
            // Probe writability.
            string probe = Path.Combine(programData, ".write-test");
            File.WriteAllText(probe, "ok");
            File.Delete(probe);
            machineScope = true;
            return programData;
        }
        catch
        {
            machineScope = false;
            return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "FullAluDoor Device Agent");
        }
    }

    public bool Exists()
    {
        return File.Exists(_identityPath) && File.Exists(_keyPath);
    }

    public bool TryLoad(out WindowsDevice identity, out Ed25519KeyPair keyPair)
    {
        identity = null!;
        keyPair = null!;
        try
        {
            if (!Exists()) return false;

            var dto = JsonSerializer.Deserialize<IdentityFileDto>(File.ReadAllText(_identityPath));
            if (dto is null || string.IsNullOrWhiteSpace(dto.DeviceId) || string.IsNullOrWhiteSpace(dto.PublicKey))
            {
                return false;
            }

            byte[] encrypted = File.ReadAllBytes(_keyPath);
            var scope = dto.Scope == "machine" ? KeyProtectionScope.LocalMachine : KeyProtectionScope.CurrentUser;
            byte[] rawPublic = Base64Url.Decode(dto.PublicKey);

            keyPair = Ed25519KeyPair.Load(encrypted, rawPublic, scope);
            identity = new WindowsDevice(
                dto.DeviceId,
                string.IsNullOrWhiteSpace(dto.DeviceName) ? AgentConstants.DefaultDeviceName : dto.DeviceName,
                dto.PublicKey,
                dto.KeyAlgorithm,
                string.IsNullOrWhiteSpace(dto.Platform) ? "Windows" : dto.Platform,
                dto.OsVersion ?? "",
                dto.AgentVersion ?? "",
                dto.Scope,
                dto.CreatedAt);
            return true;
        }
        catch (CryptographicException)
        {
            identity = null!;
            keyPair?.Dispose();
            keyPair = null!;
            return false;
        }
        catch (JsonException)
        {
            identity = null!;
            keyPair?.Dispose();
            keyPair = null!;
            return false;
        }
        catch (IOException)
        {
            identity = null!;
            keyPair?.Dispose();
            keyPair = null!;
            return false;
        }
    }

    /// <summary>
    /// Generates a brand-new random identity + Ed25519 key pair and persists
    /// them. This is the ONLY place a device identity is created.
    /// </summary>
    public WindowsDevice EnrollNew(out Ed25519KeyPair keyPair, string? deviceName = null)
    {
        string scopeText = _directory.Equals(
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "FullAluDoor Device Agent"),
            StringComparison.OrdinalIgnoreCase)
            ? "machine"
            : "user";
        var scope = scopeText == "machine" ? KeyProtectionScope.LocalMachine : KeyProtectionScope.CurrentUser;

        keyPair = Ed25519KeyPair.Generate(scope);

        var identity = new WindowsDevice(
            Guid.NewGuid().ToString("D"),
            string.IsNullOrWhiteSpace(deviceName) ? Environment.MachineName : deviceName.Trim(),
            Base64Url.Encode(keyPair.PublicKeyRaw),
            AgentConstants.KeyAlgorithm,
            "Windows",
            RuntimeInformation.OSDescription,
            AgentVersionProvider.Current,
            scopeText,
            DateTimeOffset.UtcNow.ToString("o"));

        Directory.CreateDirectory(_directory);

        var dto = new IdentityFileDto
        {
            DeviceId = identity.DeviceId,
            DeviceName = identity.DeviceName,
            PublicKey = identity.PublicKey,
            KeyAlgorithm = identity.KeyAlgorithm,
            Platform = identity.Platform,
            OsVersion = identity.OsVersion,
            AgentVersion = identity.AgentVersion,
            Scope = identity.Scope,
            CreatedAt = identity.CreatedAt,
        };

        // identity.json first, key material second: a crash in between leaves an
        // incomplete pair that TryLoad refuses (safe fail).
        File.WriteAllText(_identityPath, JsonSerializer.Serialize(dto, AgentConfigLoader.JsonOptions()));
        File.WriteAllBytes(_keyPath, keyPair.EncryptedSeed);
        return identity;
    }

    /// <summary>Removes stored identity material. Used by re-enrollment/uninstall.</summary>
    public void Purge()
    {
        try { if (File.Exists(_identityPath)) File.Delete(_identityPath); } catch { }
        try { if (File.Exists(_keyPath)) File.Delete(_keyPath); } catch { }
    }
}

public static class AgentVersionProvider
{
    public const string Current = "1.0.0";
}
