using FullAluDoor.DeviceAgent.Security;
using FullAluDoor.DeviceAgent.DeviceIdentity;
using Xunit;

namespace FullAluDoor.DeviceAgent.Tests;

public class DeviceIdentityStoreTests : IDisposable
{
    private readonly string _dir;

    public DeviceIdentityStoreTests()
    {
        _dir = Path.Combine(Path.GetTempPath(), "fad-agent-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_dir);
    }

    [Fact]
    public void Enroll_Creates_Random_Unique_DeviceIds()
    {
        var storeA = new DeviceIdentityStore(_dir);
        var storeB = new DeviceIdentityStore(Path.Combine(_dir, "b"));

        var identityA = storeA.EnrollNew(out var keyA);
        var identityB = storeB.EnrollNew(out var keyB);
        try
        {
            Assert.NotEqual(identityA.DeviceId, identityB.DeviceId);
            Assert.NotEqual(identityA.PublicKey, identityB.PublicKey);
            Assert.Matches(@"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", identityA.DeviceId);
        }
        finally
        {
            keyA.Dispose();
            keyB.Dispose();
        }
    }

    [Fact]
    public void Identity_Persists_And_Reloads_With_Working_Key()
    {
        var store = new DeviceIdentityStore(_dir);
        var identity = store.EnrollNew(out var keyPair);
        keyPair.Dispose();

        Assert.True(store.Exists());
        Assert.True(store.TryLoad(out var reloaded, out var reloadedKey));
        try
        {
            Assert.Equal(identity.DeviceId, reloaded.DeviceId);
            Assert.Equal(identity.PublicKey, reloaded.PublicKey);
            Assert.Equal(AgentConstants.KeyAlgorithm, reloaded.KeyAlgorithm);
            Assert.True(reloaded.DeviceName.Length > 0);

            byte[] message = System.Text.Encoding.UTF8.GetBytes(reloaded.DeviceId);
            byte[] signature = reloadedKey.Sign(message);
            Assert.True(reloadedKey.Verify(message, signature));
        }
        finally
        {
            reloadedKey.Dispose();
        }
    }

    [Fact]
    public void SameStore_SameIdentity_Across_Clients_Is_The_MultiBrowser_Contract()
    {
        // Chrome, Edge and Firefox on this Windows computer all talk to the SAME
        // agent process / store, therefore all present the SAME device identity.
        var store = new DeviceIdentityStore(_dir);
        var identity = store.EnrollNew(out var keyPair);
        keyPair.Dispose();

        Assert.True(store.TryLoad(out var chromeView, out var chromeKey));
        chromeKey.Dispose();
        Assert.True(store.TryLoad(out var edgeView, out var edgeKey));
        edgeKey.Dispose();
        Assert.True(store.TryLoad(out var firefoxView, out var firefoxKey));
        firefoxKey.Dispose();

        Assert.Equal(identity.DeviceId, chromeView.DeviceId);
        Assert.Equal(chromeView.DeviceId, edgeView.DeviceId);
        Assert.Equal(edgeView.DeviceId, firefoxView.DeviceId);
        Assert.Equal(chromeView.PublicKey, firefoxView.PublicKey);
    }

    [Fact]
    public void ReEnroll_Produces_A_New_Identity()
    {
        var store = new DeviceIdentityStore(_dir);
        var first = store.EnrollNew(out var firstKey);
        firstKey.Dispose();

        store.Purge();
        var second = store.EnrollNew(out var secondKey);
        secondKey.Dispose();

        Assert.NotEqual(first.DeviceId, second.DeviceId);
        Assert.NotEqual(first.PublicKey, second.PublicKey);
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { }
    }
}
