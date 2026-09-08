// Ed25519 key-pair management for the device agent.
//
// The 32-byte seed is persisted as a DPAPI-encrypted blob (Windows-protected
// storage). Signatures use the raw Ed25519 algorithm (RFC 8032) so PostgreSQL
// can verify them with libsodium (pgsodium.crypto_sign_verify_detached). The
// private seed is never exposed to JavaScript, logs or the localhost API.

using System.Security.Cryptography;
using Org.BouncyCastle.Crypto.Parameters;
using Org.BouncyCastle.Crypto.Signers;

namespace FullAluDoor.DeviceAgent.Security;

public sealed class Ed25519KeyPair : IDisposable
{
    private Ed25519PrivateKeyParameters? _privateKey;
    private readonly Ed25519PublicKeyParameters _publicKey;

    private Ed25519KeyPair(byte[] publicKeyRaw, byte[] encryptedSeed)
    {
        _publicKey = new Ed25519PublicKeyParameters(publicKeyRaw, 0);
        PublicKeyRaw = publicKeyRaw;
        EncryptedSeed = encryptedSeed;
    }

    /// <summary>Raw 32-byte Ed25519 public key (URL-safe base64 on the wire).</summary>
    public byte[] PublicKeyRaw { get; }

    /// <summary>DPAPI-encrypted 32-byte Ed25519 seed.</summary>
    public byte[] EncryptedSeed { get; }

    public static Ed25519KeyPair Generate(KeyProtectionScope scope)
    {
        byte[] seed = new byte[32];
        RandomNumberGenerator.Fill(seed);
        return FromSeed(seed, scope);
    }

    public static Ed25519KeyPair Load(byte[] encryptedSeed, byte[] expectedPublicRaw, KeyProtectionScope scope)
    {
        byte[] seed = DpapiProtector.Unprotect(encryptedSeed, scope);
        var pair = FromSeed(seed, scope, expectedPublicRaw);
        if (!pair.SelfTest())
        {
            pair.Dispose();
            throw new CryptographicException("Stored Ed25519 key failed its self test (seed does not match the public key).");
        }
        return pair;
    }

    private static Ed25519KeyPair FromSeed(byte[] seed, KeyProtectionScope scope, byte[]? expectedPublicRaw = null)
    {
        if (seed.Length != 32) throw new CryptographicException("An Ed25519 seed must be exactly 32 bytes.");

        var privateKey = new Ed25519PrivateKeyParameters(seed, 0);
        var publicKey = privateKey.GeneratePublicKey();
        byte[] publicRaw = publicKey.GetEncoded();
        if (expectedPublicRaw is not null && !publicRaw.AsSpan().SequenceEqual(expectedPublicRaw))
        {
            throw new CryptographicException("Ed25519 seed does not match the stored public key.");
        }

        byte[] encrypted = DpapiProtector.Protect(seed, scope);
        CryptographicOperations.ZeroMemory(seed);

        return new Ed25519KeyPair(publicRaw, encrypted)
        {
            _privateKey = privateKey,
        };
    }

    /// <summary>Signs raw bytes (e.g. the canonical attestation message in UTF-8).</summary>
    public byte[] Sign(byte[] data)
    {
        if (_privateKey is null) throw new InvalidOperationException("The private key is not available.");
        var signer = new Ed25519Signer();
        signer.Init(true, _privateKey);
        signer.BlockUpdate(data, 0, data.Length);
        return signer.GenerateSignature();
    }

    public bool Verify(byte[] data, byte[] signature)
    {
        var verifier = new Ed25519Signer();
        verifier.Init(false, _publicKey);
        verifier.BlockUpdate(data, 0, data.Length);
        return verifier.VerifySignature(signature);
    }

    public bool SelfTest()
    {
        var probe = new byte[] { 1, 2, 3, 4, 5 };
        byte[] signature = Sign(probe);
        return Verify(probe, signature);
    }

    public void Dispose()
    {
        _privateKey = null;
    }
}
