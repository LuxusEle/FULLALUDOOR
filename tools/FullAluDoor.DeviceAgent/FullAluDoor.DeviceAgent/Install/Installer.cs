// Lightweight user-level install support.
//
// Registers the agent to start automatically for the current Windows user via
// the HKCU Run key — no administrator rights required. Uninstall removes the
// registration and may optionally purge the stored identity/key.

using Microsoft.Win32;

namespace FullAluDoor.DeviceAgent.Install;

public static class Installer
{
    private const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string ValueName = "FullAluDoorDeviceAgent";

    public static bool InstallAutostart(string exePath)
    {
        try
        {
            using var key = Registry.CurrentUser.CreateSubKey(RunKeyPath);
            key?.SetValue(ValueName, $"\"{exePath}\" --background");
            return true;
        }
        catch
        {
            return false;
        }
    }

    public static void UninstallAutostart()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: true);
            key?.DeleteValue(ValueName, throwOnMissingValue: false);
        }
        catch
        {
            // Best-effort; the process is exiting anyway.
        }
    }

    public static bool IsAutostartRegistered()
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath);
        return key?.GetValue(ValueName) is string;
    }
}
