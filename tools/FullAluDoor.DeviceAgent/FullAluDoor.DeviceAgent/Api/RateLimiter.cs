// Minimal fixed-window rate limiter for the signing endpoint. Prevents a
// compromised page from hammering the agent into signing floods.

using System.Collections.Concurrent;

namespace FullAluDoor.DeviceAgent.Api;

public sealed class RateLimiter
{
    private readonly ConcurrentDictionary<string, Window> _windows = new(StringComparer.OrdinalIgnoreCase);
    private readonly int _max;
    private readonly int _windowSeconds;

    public RateLimiter(int max, int windowSeconds)
    {
        _max = max <= 0 ? 30 : max;
        _windowSeconds = windowSeconds <= 0 ? 10 : windowSeconds;
    }

    /// <summary>Returns true when the caller may proceed.</summary>
    public bool TryAcquire(string key)
    {
        long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var window = _windows.GetOrAdd(key, static _ => new Window());
        lock (window)
        {
            if (now - window.Start >= _windowSeconds)
            {
                window.Start = now;
                window.Count = 0;
            }
            if (window.Count >= _max) return false;
            window.Count++;
            return true;
        }
    }

    private sealed class Window
    {
        public long Start = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        public int Count;
    }
}
