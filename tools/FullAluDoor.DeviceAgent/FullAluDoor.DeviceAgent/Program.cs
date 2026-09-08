// FullAluDoor Device Agent — entry point.
//
// A tiny Windows helper that owns a device identity + Ed25519 key pair and
// exposes a loopback-only API so the FullAluDoor web app can prove, for every
// browser on this computer, that it is running on the same approved Windows
// device. It is NOT an authentication server; Supabase remains the source of
// truth for accounts, devices and approvals.

using System.Reflection;
using FullAluDoor.DeviceAgent.Api;
using FullAluDoor.DeviceAgent.DeviceIdentity;
using FullAluDoor.DeviceAgent.Install;
using FullAluDoor.DeviceAgent.Security;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace FullAluDoor.DeviceAgent;

public static class Program
{
    private static readonly CancellationTokenSource Shutdown = new();
    private static DeviceIdentityStore? _store;
    private static AgentApi? _api;
    private static bool _consoleAvailable = !Console.IsOutputRedirected && !Console.IsInputRedirected;

    public static async Task<int> Main(string[] args)
    {
        Console.CancelKeyPress += (_, e) =>
        {
            e.Cancel = true;
            Shutdown.Cancel();
        };

        try
        {
            return await Run(args);
        }
        catch (OperationCanceledException)
        {
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"FullAluDoor Device Agent failed: {ex.Message}");
            return 1;
        }
        finally
        {
            if (_api is not null)
            {
                await _api.DisposeAsync();
            }
        }
    }

    private static async Task<int> Run(string[] args)
    {
        int? cliPort = null;
        bool reEnroll = false;
        bool background = false;

        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--version":
                case "-v":
                    Console.WriteLine(VersionString());
                    return 0;
                case "--re-enroll":
                    reEnroll = true;
                    break;
                case "--background":
                    background = true;
                    break;
                case "--install":
                    return Installer.InstallAutostart(Environment.ProcessPath ?? Assembly.GetExecutingAssembly().Location) ? 0 : 1;
                case "--uninstall":
                    Installer.UninstallAutostart();
                    if (args.Any(a => a == "--purge"))
                    {
                        var purgeStore = new DeviceIdentityStore();
                        purgeStore.Purge();
                        Console.WriteLine("Device identity purged.");
                    }
                    Console.WriteLine("FullAluDoor Device Agent uninstalled from startup.");
                    return 0;
                case "--port":
                    if (i + 1 < args.Length && int.TryParse(args[++i], out int parsed)) cliPort = parsed;
                    break;
                case "--help":
                case "-h":
                    PrintHelp();
                    return 0;
            }
        }

        var config = AgentConfigLoader.Load(cliPort);
        _store = new DeviceIdentityStore();
        WindowsDevice identity;
        Ed25519KeyPair keyPair;

        if (reEnroll)
        {
            _store.Purge();
            identity = _store.EnrollNew(out keyPair);
            Console.WriteLine($"Re-enrolled. New device id: {identity.DeviceId}");
        }
        else if (!_store.TryLoad(out identity, out keyPair))
        {
            identity = _store.EnrollNew(out keyPair);
            Console.WriteLine("First run — enrolled this Windows device.");
        }

        _api = new AgentApi(identity, keyPair, config);
        await _api.StartAsync(Array.Empty<string>());

        Console.WriteLine();
        Console.WriteLine("FullAluDoor Device Agent");
        Console.WriteLine($"  Version   : {VersionString()}");
        Console.WriteLine($"  Status    : Connected");
        Console.WriteLine($"  Device ID : {identity.DeviceId}");
        Console.WriteLine($"  Storage   : {_store.DirectoryPath} ({identity.Scope} scope)");
        Console.WriteLine($"  Endpoint  : {_api.BaseUrl}  (loopback only)");
        Console.WriteLine();

        if (background || !_consoleAvailable)
        {
            // Run silently until stopped (service-style).
            await Task.Delay(Timeout.Infinite, Shutdown.Token);
            return 0;
        }

        Console.WriteLine("Commands: [s]tatus  [i]nfo  [r]e-enroll  [o]pen FullAluDoor  [a]bout  [q]uit");
        while (!Shutdown.IsCancellationRequested)
        {
            string? line = Console.ReadLine();
            switch ((line ?? "").Trim().ToLowerInvariant())
            {
                case "s":
                case "status":
                    Console.WriteLine($"Status: Connected | Device: {identity.DeviceId} | Version: {VersionString()}");
                    break;
                case "i":
                case "info":
                    Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(_api.PublicInfo()));
                    break;
                case "r":
                case "re-enroll":
                    Console.Write("Re-enrollment generates a NEW device identity and key pair. The existing approval will NOT transfer. Continue? [y/N] ");
                    string? confirm = Console.ReadLine();
                    if (string.Equals(confirm, "y", StringComparison.OrdinalIgnoreCase))
                    {
                        _store.Purge();
                        identity = _store.EnrollNew(out keyPair);
                        Console.WriteLine($"Re-enrolled. New device id: {identity.DeviceId}. Ask an administrator to approve the new device.");
                    }
                    else
                    {
                        Console.WriteLine("Re-enrollment cancelled.");
                    }
                    break;
                case "o":
                case "open":
                    Console.WriteLine("Open FullAluDoor in your browser (e.g. http://localhost:3000 or your configured deployment origin).");
                    break;
                case "a":
                case "about":
                    Console.WriteLine("FullAluDoor Device Agent — Windows device identity + attestation helper.");
                    Console.WriteLine("It verifies this Windows computer to the FullAluDoor web application. No private keys are ever shown.");
                    break;
                case "q":
                case "quit":
                case "exit":
                    Shutdown.Cancel();
                    break;
            }
        }
        return 0;
    }

    public static string VersionString()
    {
        var version = Assembly.GetExecutingAssembly().GetName().Version;
        return version is null ? "1.0.0" : $"{version.Major}.{version.Minor}.{version.Build}";
    }

    private static void PrintHelp()
    {
        Console.WriteLine("""
            FullAluDoor Device Agent

            Options:
              --version           Show version
              --re-enroll         Generate a brand new device identity + key pair
              --install           Register automatic startup for the current user
              --uninstall         Remove automatic startup (--purge also deletes identity)
              --background        Run silently (no interactive menu)
              --port <number>     Override the loopback port (default 8750)
            """);
    }
}
