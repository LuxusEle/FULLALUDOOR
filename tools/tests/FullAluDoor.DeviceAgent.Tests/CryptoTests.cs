using System.Security.Cryptography;
using FullAluDoor.DeviceAgent.Security;
using Xunit;

namespace FullAluDoor.DeviceAgent.Tests;

public class Base64UrlTests
{
    [Fact]
    public void RoundTrips_ArbitraryBytes()
    {
        byte[] input = { 0, 1, 2, 250, 251, 252, 253, 254, 255 };
        string encoded = Base64Url.Encode(input);
        Assert.DoesNotContain("=", encoded);
        Assert.Equal(input, Base64Url.Decode(encoded));
    }

    [Fact]
    public void Encode_IsUrlSafe()
    {
        byte[] input = new byte[64];
        RandomNumberGenerator.Fill(input);
        string encoded = Base64Url.Encode(input);
        Assert.All(encoded, c => Assert.True(char.IsAsciiLetterOrDigit(c) || c == '-' || c == '_'));
    }
}

public class Ed25519KeyPairTests
{
    [Fact]
    public void Generate_ProducesValidKeyPair_AndSelfTestPasses()
    {
        using var pair = Ed25519KeyPair.Generate(KeyProtectionScope.CurrentUser);
        Assert.Equal(32, pair.PublicKeyRaw.Length);
        Assert.True(pair.EncryptedSeed.Length > 0);
    }

    [Fact]
    public void Sign_AndVerify_RoundTrip()
    {
        using var pair = Ed25519KeyPair.Generate(KeyProtectionScope.CurrentUser);
        byte[] message = System.Text.Encoding.UTF8.GetBytes("challenge-message");
        byte[] signature = pair.Sign(message);
        Assert.Equal(64, signature.Length);
        Assert.True(pair.Verify(message, signature));
        Assert.False(pair.Verify(System.Text.Encoding.UTF8.GetBytes("tampered"), signature));
    }

    [Fact]
    public void TwoKeyPairs_AreDistinct()
    {
        using var a = Ed25519KeyPair.Generate(KeyProtectionScope.CurrentUser);
        using var b = Ed25519KeyPair.Generate(KeyProtectionScope.CurrentUser);
        Assert.NotEqual(a.PublicKeyRaw, b.PublicKeyRaw);
    }

    [Fact]
    public void Protected_Key_Loads_And_Matches_PublicKey()
    {
        using var original = Ed25519KeyPair.Generate(KeyProtectionScope.CurrentUser);
        using var reloaded = Ed25519KeyPair.Load(original.EncryptedSeed, original.PublicKeyRaw, KeyProtectionScope.CurrentUser);
        Assert.Equal(original.PublicKeyRaw, reloaded.PublicKeyRaw);

        byte[] message = System.Text.Encoding.UTF8.GetBytes("persist-check");
        byte[] signature = reloaded.Sign(message);
        Assert.True(original.Verify(message, signature));
    }

    [Fact]
    public void Replay_Signature_Verifies_But_Server_SingleUse_Prevents_Reuse()
    {
        // The agent is stateless: signing the same message twice yields the
        // same verifiable signature. Single-use / replay protection is enforced
        // server-side by consuming the challenge (device_attestation_challenges
        // .consumed_at). This test documents that boundary.
        using var pair = Ed25519KeyPair.Generate(KeyProtectionScope.CurrentUser);
        byte[] message = System.Text.Encoding.UTF8.GetBytes("device.challenge.nonce");
        byte[] sig1 = pair.Sign(message);
        byte[] sig2 = pair.Sign(message);
        Assert.True(pair.Verify(message, sig1));
        Assert.Equal(sig1, sig2);
    }
}
