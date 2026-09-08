using FullAluDoor.DeviceAgent.DeviceIdentity;
using Xunit;

namespace FullAluDoor.DeviceAgent.Tests;

public class AttestationProtocolTests
{
    private static readonly string DeviceId = Guid.NewGuid().ToString("D");
    private static readonly string ChallengeId = Guid.NewGuid().ToString("D");
    private const string Nonce = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-";

    [Fact]
    public void WellFormed_Canonical_Message_Is_Accepted()
    {
        string message = $"{DeviceId}.{ChallengeId}.{Nonce}";
        Assert.True(AttestationProtocol.IsWellFormedMessage(message));
        Assert.True(AttestationProtocol.TryParseDeviceId(message, out var parsed));
        Assert.Equal(DeviceId, parsed);
        Assert.True(AttestationProtocol.BelongsToDevice(message, DeviceId));
    }

    [Fact]
    public void Malformed_Messages_Are_Rejected()
    {
        Assert.False(AttestationProtocol.IsWellFormedMessage(""));
        Assert.False(AttestationProtocol.IsWellFormedMessage("garbage"));
        Assert.False(AttestationProtocol.IsWellFormedMessage("not-a-uuid." + ChallengeId + "." + Nonce));
        Assert.False(AttestationProtocol.IsWellFormedMessage($"{DeviceId}.{ChallengeId}.too-short"));
        Assert.False(AttestationProtocol.IsWellFormedMessage($"{DeviceId}.{ChallengeId}.{Nonce}.extra"));
    }

    [Fact]
    public void Agent_WonNot_Sign_For_Another_Device()
    {
        string message = $"{Guid.NewGuid():D}.{ChallengeId}.{Nonce}";
        Assert.False(AttestationProtocol.BelongsToDevice(message, DeviceId));
    }
}
