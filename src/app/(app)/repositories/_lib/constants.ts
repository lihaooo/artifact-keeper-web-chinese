import type { RepositoryFormat, RepositoryType } from "@/types";

export const FORMAT_OPTIONS: { value: RepositoryFormat; label: string; group: string }[] = [
  // Core package managers
  { value: "maven", label: "Maven", group: "核心" },
  { value: "gradle", label: "Gradle", group: "核心" },
  { value: "npm", label: "NPM", group: "核心" },
  { value: "pypi", label: "PyPI", group: "核心" },
  { value: "nuget", label: "NuGet", group: "核心" },
  { value: "go", label: "Go", group: "核心" },
  { value: "cargo", label: "Cargo", group: "核心" },
  { value: "rubygems", label: "RubyGems", group: "核心" },
  { value: "conan", label: "Conan (C/C++)", group: "核心" },
  { value: "composer", label: "Composer (PHP)", group: "核心" },
  { value: "hex", label: "Hex (Erlang/Elixir)", group: "核心" },
  { value: "pub", label: "Pub (Dart)", group: "核心" },
  { value: "sbt", label: "SBT (Scala)", group: "核心" },
  { value: "cran", label: "CRAN (R)", group: "核心" },
  { value: "generic", label: "Generic", group: "核心" },
  // Container / OCI
  { value: "docker", label: "Docker", group: "容器" },
  { value: "helm", label: "Helm", group: "容器" },
  { value: "podman", label: "Podman", group: "容器" },
  { value: "buildx", label: "Buildx", group: "容器" },
  { value: "oras", label: "ORAS", group: "容器" },
  { value: "wasm_oci", label: "WASM OCI", group: "容器" },
  { value: "helm_oci", label: "Helm OCI", group: "容器" },
  { value: "incus", label: "Incus", group: "容器" },
  { value: "lxc", label: "LXC", group: "容器" },
  // Linux distro packages
  { value: "debian", label: "Debian/APT", group: "Linux" },
  { value: "rpm", label: "RPM/YUM", group: "Linux" },
  { value: "alpine", label: "Alpine APK", group: "Linux" },
  { value: "opkg", label: "OPKG", group: "Linux" },
  // Language ecosystem aliases
  { value: "poetry", label: "Poetry", group: "生态系统" },
  { value: "conda", label: "Conda", group: "生态系统" },
  { value: "conda_native", label: "Conda Native", group: "生态系统" },
  { value: "yarn", label: "Yarn", group: "生态系统" },
  { value: "pnpm", label: "PNPM", group: "生态系统" },
  { value: "bower", label: "Bower", group: "生态系统" },
  { value: "chocolatey", label: "Chocolatey", group: "生态系统" },
  { value: "powershell", label: "PowerShell", group: "生态系统" },
  { value: "cocoapods", label: "CocoaPods", group: "生态系统" },
  { value: "swift", label: "Swift", group: "生态系统" },
  // Infrastructure / IaC
  { value: "terraform", label: "Terraform", group: "基础设施" },
  { value: "opentofu", label: "OpenTofu", group: "基础设施" },
  { value: "chef", label: "Chef", group: "基础设施" },
  { value: "puppet", label: "Puppet", group: "基础设施" },
  { value: "ansible", label: "Ansible", group: "基础设施" },
  { value: "vagrant", label: "Vagrant", group: "基础设施" },
  // IDE extensions
  { value: "vscode", label: "VS Code Extensions", group: "扩展" },
  { value: "jetbrains", label: "JetBrains Plugins", group: "扩展" },
  // ML/AI
  { value: "huggingface", label: "HuggingFace", group: "ML/AI" },
  { value: "mlmodel", label: "ML Model", group: "ML/AI" },
  // Other
  { value: "gitlfs", label: "Git LFS", group: "其他" },
  { value: "bazel", label: "Bazel", group: "其他" },
  { value: "p2", label: "P2 (Eclipse)", group: "其他" },
  { value: "protobuf", label: "Protobuf (BSR)", group: "其他" },
];

export const FORMAT_GROUPS = Array.from(
  FORMAT_OPTIONS.reduce((map, o) => {
    if (!map.has(o.group)) map.set(o.group, []);
    map.get(o.group)!.push(o);
    return map;
  }, new Map<string, typeof FORMAT_OPTIONS>())
);

export const TYPE_OPTIONS: { value: RepositoryType; label: string }[] = [
  { value: "local", label: "本地" },
  { value: "staging", label: "暂存" },
  { value: "remote", label: "远程" },
  { value: "virtual", label: "虚拟" },
];
