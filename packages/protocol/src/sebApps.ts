/**
 * The applications a locked contest lets a competitor run.
 *
 * SEB identifies an application differently per platform: macOS by bundle
 * identifier, Windows by executable name. One entry here carries both, and the
 * generator emits a `permittedProcesses` row for each platform the entry names,
 * so a single catalogue covers a room of mixed machines.
 *
 * Everything here is permitted by default. The configuration MOJ generates does
 * not filter the network or kill processes, so leaving a compiler or an editor
 * out would inconvenience a competitor without closing anything.
 */

export type SebApplication = {
  id: string;
  title: string;
  /** macOS bundle identifier. */
  macBundleId?: string;
  /** Windows executable, as it appears in the process list. */
  windowsExecutable?: string;
};

export const SEB_APPLICATIONS: readonly SebApplication[] = [
  // Editors
  {
    id: "vscode",
    title: "Visual Studio Code",
    macBundleId: "com.microsoft.VSCode",
    windowsExecutable: "Code.exe",
  },
  {
    id: "vscode-insiders",
    title: "Visual Studio Code Insiders",
    macBundleId: "com.microsoft.VSCodeInsiders",
    windowsExecutable: "Code - Insiders.exe",
  },
  { id: "vscodium", title: "VSCodium", macBundleId: "com.vscodium", windowsExecutable: "VSCodium.exe" },
  {
    id: "sublime",
    title: "Sublime Text",
    macBundleId: "com.sublimetext.4",
    windowsExecutable: "sublime_text.exe",
  },
  { id: "notepadpp", title: "Notepad++", windowsExecutable: "notepad++.exe" },

  // JetBrains
  {
    id: "idea",
    title: "IntelliJ IDEA",
    macBundleId: "com.jetbrains.intellij",
    windowsExecutable: "idea64.exe",
  },
  {
    id: "idea-ce",
    title: "IntelliJ IDEA Community",
    macBundleId: "com.jetbrains.intellij.ce",
    windowsExecutable: "idea64.exe",
  },
  { id: "clion", title: "CLion", macBundleId: "com.jetbrains.CLion", windowsExecutable: "clion64.exe" },
  {
    id: "pycharm",
    title: "PyCharm",
    macBundleId: "com.jetbrains.pycharm",
    windowsExecutable: "pycharm64.exe",
  },
  {
    id: "pycharm-ce",
    title: "PyCharm Community",
    macBundleId: "com.jetbrains.pycharm.ce",
    windowsExecutable: "pycharm64.exe",
  },
  {
    id: "webstorm",
    title: "WebStorm",
    macBundleId: "com.jetbrains.WebStorm",
    windowsExecutable: "webstorm64.exe",
  },
  { id: "rider", title: "Rider", macBundleId: "com.jetbrains.rider", windowsExecutable: "rider64.exe" },
  { id: "goland", title: "GoLand", macBundleId: "com.jetbrains.goland", windowsExecutable: "goland64.exe" },

  // The rest of what a university lab has on it
  { id: "xcode", title: "Xcode", macBundleId: "com.apple.dt.Xcode" },
  { id: "visualstudio", title: "Visual Studio", windowsExecutable: "devenv.exe" },
  { id: "eclipse", title: "Eclipse", macBundleId: "org.eclipse.eclipse", windowsExecutable: "eclipse.exe" },
  { id: "netbeans", title: "NetBeans", macBundleId: "org.netbeans.ide", windowsExecutable: "netbeans64.exe" },
  { id: "codeblocks", title: "Code::Blocks", windowsExecutable: "codeblocks.exe" },
  { id: "devcpp", title: "Dev-C++", windowsExecutable: "devcpp.exe" },
  { id: "geany", title: "Geany", windowsExecutable: "geany.exe" },

  // Terminals. A competitor compiling by hand needs one, and the configuration
  // does not restrict the network in any case, so leaving them out would stop
  // nothing.
  { id: "terminal", title: "Terminal", macBundleId: "com.apple.Terminal" },
  { id: "iterm", title: "iTerm", macBundleId: "com.googlecode.iterm2" },
  { id: "cmd", title: "Command Prompt", windowsExecutable: "cmd.exe" },
  { id: "powershell", title: "PowerShell", windowsExecutable: "powershell.exe" },
  { id: "windowsterminal", title: "Windows Terminal", windowsExecutable: "WindowsTerminal.exe" },
];

/** SEB's `os` discriminator on a permitted process. */
export const SEB_OS_MACOS = 0;
export const SEB_OS_WINDOWS = 1;
