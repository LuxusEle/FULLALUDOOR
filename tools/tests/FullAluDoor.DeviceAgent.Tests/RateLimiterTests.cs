using FullAluDoor.DeviceAgent.Api;
using Xunit;

namespace FullAluDoor.DeviceAgent.Tests;

public class RateLimiterTests
{
    [Fact]
    public void Allows_UpTo_Max_Then_Denies()
    {
        var limiter = new RateLimiter(3, 60);
        Assert.True(limiter.TryAcquire("a"));
        Assert.True(limiter.TryAcquire("a"));
        Assert.True(limiter.TryAcquire("a"));
        Assert.False(limiter.TryAcquire("a"));
    }

    [Fact]
    public void Keys_Are_Independent()
    {
        var limiter = new RateLimiter(1, 60);
        Assert.True(limiter.TryAcquire("chrome"));
        Assert.False(limiter.TryAcquire("chrome"));
        Assert.True(limiter.TryAcquire("edge"));
    }
}
