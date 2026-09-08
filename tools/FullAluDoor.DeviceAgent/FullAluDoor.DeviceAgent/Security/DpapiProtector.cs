// Windows-protected storage wrapper (DPAPI). Used to encrypt the Ed25519
// private key at rest. The key never leaves this machine unencrypted and is
// never exposed to JavaScript, logs or the localhost API.

using System.Security.Cryptography;

namespace FullAluDoor.DeviceAgent.Security;

public enum KeyProtectionScope
{
    CurrentUser,
    LocalMachine,
}

public static class DpapiProtector
{
    public static byte[] Protect(byte[] plaintext, KeyProtectionScope scope)
    {
        return ProtectedData.Protect(
            plaintext,
            optionalEntropy: null,
            scope == KeyProtectionScope.LocalMachine
                ? DataProtectionScope.LocalMachine
                : DataProtectionScope.CurrentUser);
    }

    public static byte[] Unprotect(byte[] ciphertext, KeyProtectionScope scope)
    {
        try
        {
            return ProtectedData.Unprotect(
                ciphertext,
                optionalEntropy: null,
                scope == KeyProtectionScope.LocalMachine
                    ? DataProtectionScope.LocalMachine
                    : DataProtectionScope.CurrentUser);
        }
        catch (CryptographicException)
        {
            throw new InvalidOperationException(
                "The protected device key could not be decrypted for the current Windows user. " +
                "If the identity was created by another user/scope, re-enroll the device.");
        }
    }
}
