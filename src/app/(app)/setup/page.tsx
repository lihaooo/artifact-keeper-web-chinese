"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Code,
  Rocket,
  Package,
  Search,
  Filter,
} from "lucide-react";

import { repositoriesApi } from "@/lib/api/repositories";
import type { Repository } from "@/types";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

import { PageHeader } from "@/components/common/page-header";
import { CopyButton } from "@/components/common/copy-button";

// -- types --

interface SetupStep {
  title: string;
  code: string;
  description?: string;
}

/** A single client variant for a repository format (e.g. Maven vs. Gradle for a
 *  JVM repo). The Setup dialog renders one tab per variant when present. */
interface SetupClientVariant {
  key: string;
  label: string;
  steps: SetupStep[];
}

/** Setup content for a repository — either a flat list of steps (most formats)
 *  or a set of client-tool variants (e.g. JVM repos serve Maven, Gradle Groovy,
 *  Gradle Kotlin DSL, and SBT clients from the same wire format). */
type RepoSetupContent =
  | { kind: "steps"; steps: SetupStep[] }
  | { kind: "variants"; variants: SetupClientVariant[]; defaultKey: string };

interface CICDPlatform {
  key: string;
  name: string;
  description: string;
  steps: SetupStep[];
}

// -- helpers --

// SSR-safe placeholders that are obviously non-functional so the prerendered
// HTML doesn't ship with a real-looking domain (`artifacts.example.com`)
// that a user might copy into a config file before the client hydrates and
// rewrites them. After hydration `typeof window !== "undefined"` flips and
// the snippets contain the live origin (#362).
const REGISTRY_URL_PLACEHOLDER = "__REPLACE_WITH_REGISTRY_URL__";
const REGISTRY_HOST_PLACEHOLDER = "__REPLACE_WITH_REGISTRY_HOST__";

const REGISTRY_URL =
  typeof window !== "undefined"
    ? window.location.origin
    : REGISTRY_URL_PLACEHOLDER;

const REGISTRY_HOST =
  typeof window !== "undefined"
    ? window.location.host
    : REGISTRY_HOST_PLACEHOLDER;

/**
 * Sanitize a repo key into a Gradle/SBT-friendly camelCase identifier for
 * property names. Repo keys like `my-jvm-repo` are legal in `gradle.properties`
 * (the file format permits hyphens and dots), but they look wrong to readers
 * who assume identifier rules apply. Convert kebab/dot/underscore-case to
 * camelCase and strip any remaining non-alphanumerics. URLs and `<id>` slots
 * keep the raw key — only property names need this. (#362)
 */
export function repoKeyToGradleId(key: string): string {
  if (!key) return "repo";
  const camel = key.replace(/[-._\s]+(.)/g, (_, c: string) => c.toUpperCase());
  const cleaned = camel.replace(/[^a-zA-Z0-9]/g, "");
  return cleaned.length > 0 ? cleaned : "repo";
}

/** Build the JVM client variants (Maven, Gradle Groovy DSL, Gradle Kotlin DSL,
 *  SBT). All four clients consume the same Maven-format wire repository, so we
 *  surface tabs for each. */
function getJvmClientVariants(repoKey: string): SetupClientVariant[] {
  const repoUrl = `${REGISTRY_URL}/maven/${repoKey}/`;
  // Keep `repoKey` in URLs and `<id>` slots; sanitize for Gradle property
  // names so `my-jvm-repo` doesn't emit `my-jvm-repoUsername` (#362).
  const gradleId = repoKeyToGradleId(repoKey);
  const gradleCredentials: SetupStep = {
    title: "配置凭据",
    description: "添加到 ~/.gradle/gradle.properties：",
    code: `${gradleId}Username=YOUR_USERNAME
${gradleId}Password=YOUR_TOKEN`,
  };
  const gradlePublish: SetupStep = { title: "发布制品", code: "gradle publish" };

  return [
    {
      key: "maven",
      label: "Maven",
      steps: [
        {
          title: "配置 settings.xml",
          description: "添加到 ~/.m2/settings.xml：",
          code: `<settings>
  <servers>
    <server>
      <id>${repoKey}</id>
      <username>YOUR_USERNAME</username>
      <password>YOUR_TOKEN</password>
    </server>
  </servers>
</settings>`,
        },
        {
          title: "将仓库添加到 pom.xml",
          code: `<repositories>
  <repository>
    <id>${repoKey}</id>
    <url>${repoUrl}</url>
  </repository>
</repositories>
<dependency>
  <groupId>com.example</groupId>
  <artifactId>your-artifact</artifactId>
  <version>1.0.0</version>
</dependency>`,
        },
        { title: "部署制品", code: "mvn deploy" },
      ],
    },
    {
      key: "gradle-groovy",
      label: "Gradle (Groovy)",
      steps: [
        gradleCredentials,
        {
          title: "将仓库添加到 build.gradle",
          code: `repositories {
    maven {
        url '${repoUrl}'
        credentials {
            username = project.findProperty('${gradleId}Username')
            password = project.findProperty('${gradleId}Password')
        }
    }
}
dependencies {
    implementation 'com.example:your-artifact:1.0.0'
}`,
        },
        gradlePublish,
      ],
    },
    {
      key: "gradle-kotlin",
      label: "Gradle (Kotlin)",
      steps: [
        gradleCredentials,
        {
          title: "将仓库添加到 build.gradle.kts",
          code: `repositories {
    maven {
        url = uri("${repoUrl}")
        credentials {
            username = project.findProperty("${gradleId}Username") as String?
            password = project.findProperty("${gradleId}Password") as String?
        }
    }
}
dependencies {
    implementation("com.example:your-artifact:1.0.0")
}`,
        },
        gradlePublish,
      ],
    },
    {
      key: "sbt",
      label: "SBT",
      steps: [
        {
          title: "配置凭据",
          description: "添加到 ~/.sbt/.credentials：",
          code: `realm=Artifact Keeper
host=${REGISTRY_HOST}
user=YOUR_USERNAME
password=YOUR_TOKEN`,
        },
        {
          title: "将解析器添加到 build.sbt",
          code: `credentials += Credentials(Path.userHome / ".sbt" / ".credentials")
resolvers += "${repoKey}" at "${repoUrl}"
libraryDependencies += "com.example" %% "your-artifact" % "1.0.0"`,
        },
        { title: "发布制品", code: "sbt publish" },
      ],
    },
  ];
}

/** Default JVM-variant tab keyed by the repo's declared format. A "Gradle" repo
 *  opens on Gradle (Groovy DSL is the more common variant in the wild) so the
 *  user doesn't have to click an extra tab to reach their tooling. */
const JVM_DEFAULT_VARIANT: Record<"maven" | "gradle" | "sbt", string> = {
  maven: "maven",
  gradle: "gradle-groovy",
  sbt: "sbt",
};

/** Generate repo-specific setup content based on format. JVM formats return a
 *  set of client variants (rendered as tabs); all other formats return a flat
 *  list of steps. */
function getRepoSetupContent(repo: Repository): RepoSetupContent {
  if (repo.format === "maven" || repo.format === "gradle" || repo.format === "sbt") {
    return {
      kind: "variants",
      variants: getJvmClientVariants(repo.key),
      defaultKey: JVM_DEFAULT_VARIANT[repo.format],
    };
  }
  return { kind: "steps", steps: getRepoSetupSteps(repo) };
}

/** Generate repo-specific setup steps for non-JVM formats. */
function getRepoSetupSteps(repo: Repository): SetupStep[] {
  const repoKey = repo.key;

  switch (repo.format) {
    case "npm":
    case "yarn":
    case "pnpm":
      return [
        {
          title: "配置仓库源",
          description: "添加到 .npmrc 文件或运行：",
          code: `npm config set @${repoKey}:registry ${REGISTRY_URL}/npm/${repoKey}/
npm config set //${REGISTRY_HOST}/npm/${repoKey}/:_authToken YOUR_TOKEN`,
        },
        {
          title: "安装包",
          code: `npm install @${repoKey}/<package-name>`,
        },
        {
          title: "发布包",
          code: `npm publish --registry ${REGISTRY_URL}/npm/${repoKey}/`,
        },
      ];
    case "pypi":
    case "poetry":
    case "conda":
      return [
        {
          title: "配置 pip",
          description: "添加到 ~/.pip/pip.conf 或 ~/.config/pip/pip.conf：",
          code: `[global]
index-url = ${REGISTRY_URL}/pypi/${repoKey}/simple/
trusted-host = ${REGISTRY_HOST}`,
        },
        {
          title: "安装包",
          code: `pip install --index-url ${REGISTRY_URL}/pypi/${repoKey}/simple/ <package-name>`,
        },
        {
          title: "使用 twine 上传",
          code: `twine upload --repository-url ${REGISTRY_URL}/pypi/${repoKey}/ dist/*`,
        },
      ];
    case "docker":
    case "podman":
    case "buildx":
    case "oras":
      return [
        {
          title: "登录仓库",
          code: `docker login ${REGISTRY_HOST}`,
        },
        {
          title: "标记镜像",
          code: `docker tag my-image:latest ${REGISTRY_HOST}/${repoKey}/my-image:latest`,
        },
        {
          title: "推送镜像",
          code: `docker push ${REGISTRY_HOST}/${repoKey}/my-image:latest`,
        },
        {
          title: "拉取镜像",
          code: `docker pull ${REGISTRY_HOST}/${repoKey}/my-image:latest`,
        },
      ];
    case "incus":
    case "lxc":
      return [
        {
          title: "添加为 SimpleStreams 远程源",
          code: `incus remote add ${repoKey} ${REGISTRY_URL}/incus/${repoKey} \\
  --protocol simplestreams --public`,
        },
        {
          title: "上传镜像",
          code: `curl -X PUT -u admin:password \\
  -H "Content-Type: application/x-xz" \\
  --data-binary @image.tar.xz \\
  ${REGISTRY_URL}/incus/${repoKey}/images/ubuntu-noble/20240215/incus.tar.xz`,
        },
        {
          title: "列出镜像",
          code: `incus image list ${repoKey}:`,
        },
        {
          title: "启动容器",
          code: `incus launch ${repoKey}:ubuntu-noble my-container`,
        },
      ];
    case "cargo":
      return [
        {
          title: "配置 Cargo",
          description: "添加到 ~/.cargo/config.toml：",
          code: `[registries.${repoKey}]
index = "${REGISTRY_URL}/cargo/${repoKey}/index"
token = "YOUR_TOKEN"`,
        },
        {
          title: "发布 crate",
          code: `cargo publish --registry ${repoKey}`,
        },
        {
          title: "添加依赖",
          description: "在 Cargo.toml 中：",
          code: `[dependencies]
my-crate = { version = "0.1", registry = "${repoKey}" }`,
        },
      ];
    case "helm":
    case "helm_oci":
      return [
        {
          title: "添加 Helm 仓库",
          code: `helm repo add ${repoKey} ${REGISTRY_URL}/helm/${repoKey}/
helm repo update`,
        },
        {
          title: "推送 Chart",
          code: `helm push my-chart-0.1.0.tgz oci://${REGISTRY_HOST}/${repoKey}/`,
        },
        {
          title: "安装 Chart",
          code: `helm install my-release ${repoKey}/my-chart`,
        },
      ];
    case "nuget":
      return [
        {
          title: "添加 NuGet 源",
          code: `dotnet nuget add source ${REGISTRY_URL}/nuget/${repoKey}/v3/index.json \\
  --name ${repoKey} --username YOUR_USERNAME --password YOUR_TOKEN`,
        },
        {
          title: "推送包",
          code: `dotnet nuget push MyPackage.1.0.0.nupkg --source ${repoKey} --api-key YOUR_TOKEN`,
        },
        {
          title: "安装包",
          code: `dotnet add package MyPackage --source ${repoKey}`,
        },
      ];
    case "go":
      return [
        {
          title: "配置 Go 代理",
          code: `export GOPROXY=${REGISTRY_URL}/go/${repoKey},direct
export GONOSUMCHECK=*`,
        },
        {
          title: "添加依赖",
          code: "go get example.com/my-module@latest",
        },
      ];
    case "rubygems":
      return [
        {
          title: "配置 Bundler",
          description: "在 Gemfile 中：",
          code: `source "${REGISTRY_URL}/gems/${repoKey}/"`,
        },
        {
          title: "发布 gem",
          code: `gem push my-gem-0.1.0.gem --host ${REGISTRY_URL}/gems/${repoKey}/`,
        },
      ];
    case "debian":
      return [
        {
          title: "添加 APT 仓库",
          description: "添加到 /etc/apt/sources.list.d/artifact-keeper.list：",
          code: `deb ${REGISTRY_URL}/debian/${repoKey}/ stable main`,
        },
        {
          title: "更新并安装",
          code: `sudo apt update
sudo apt install <package-name>`,
        },
      ];
    case "rpm":
      return [
        {
          title: "添加 YUM/DNF 仓库",
          description: "创建 /etc/yum.repos.d/artifact-keeper.repo：",
          code: `[${repoKey}]
name=Artifact Keeper - ${repo.name}
baseurl=${REGISTRY_URL}/rpm/${repoKey}/
enabled=1
gpgcheck=0`,
        },
        {
          title: "安装包",
          code: `sudo dnf install <package-name>`,
        },
      ];
    case "terraform":
    case "opentofu":
      return [
        {
          title: "配置 Provider 镜像",
          description: "在 ~/.terraformrc 中：",
          code: `provider_installation {
  network_mirror {
    url = "${REGISTRY_URL}/terraform/${repoKey}/"
  }
}`,
        },
      ];
    case "composer":
      return [
        {
          title: "添加 Composer 仓库",
          code: `composer config repositories.${repoKey} composer ${REGISTRY_URL}/composer/${repoKey}/`,
        },
        {
          title: "引入包",
          code: `composer require vendor/package`,
        },
      ];
    case "alpine":
      return [
        {
          title: "添加 APK 仓库",
          description: "添加到 /etc/apk/repositories：",
          code: `${REGISTRY_URL}/alpine/${repoKey}/`,
        },
        {
          title: "安装包",
          code: `apk add <package-name>`,
        },
      ];
    case "protobuf":
      return [
        {
          title: "配置 buf.yaml",
          description: "在模块的 buf.yaml 中设置仓库：",
          code: `# buf.yaml
version: v2
modules:
  - path: proto
    name: ${REGISTRY_HOST}/proto/${repoKey}/myorg/mymodule`,
        },
        {
          title: "使用 buf CLI 认证",
          code: `buf registry login ${REGISTRY_HOST} --username YOUR_USERNAME --token-stdin <<< "YOUR_TOKEN"`,
        },
        {
          title: "推送模块",
          code: `buf push --registry ${REGISTRY_URL}/proto/${repoKey}`,
        },
        {
          title: "添加依赖",
          description: "在 buf.yaml 中添加依赖并运行更新：",
          code: `# buf.yaml
deps:
  - ${REGISTRY_HOST}/proto/${repoKey}/owner/module

# Then resolve:
buf dep update`,
        },
      ];
    default:
      return [
        {
          title: "上传制品",
          code: `curl -X PUT -H "Authorization: Bearer YOUR_TOKEN" \\
  -T ./my-file.tar.gz \\
  ${REGISTRY_URL}/api/v1/repositories/${repoKey}/artifacts/my-file.tar.gz`,
        },
        {
          title: "下载制品",
          code: `curl -O ${REGISTRY_URL}/api/v1/repositories/${repoKey}/download/my-file.tar.gz`,
        },
      ];
  }
}

// -- CI/CD data --

const CICD_PLATFORMS: CICDPlatform[] = [
  {
    key: "github",
    name: "GitHub Actions",
    description: "GitHub CI/CD 工作流",
    steps: [
      {
        title: "添加密钥",
        description:
          "前往 Settings > Secrets 添加 ARTIFACT_KEEPER_TOKEN 和 ARTIFACT_KEEPER_URL。",
        code: `# .github/workflows/publish.yml
name: Publish
on:
  push:
    tags: ['v*']

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Publish to Artifact Keeper
        env:
          REGISTRY_URL: \${{ secrets.ARTIFACT_KEEPER_URL }}
          REGISTRY_TOKEN: \${{ secrets.ARTIFACT_KEEPER_TOKEN }}
        run: |
          # Configure and publish your artifacts here`,
      },
    ],
  },
  {
    key: "gitlab",
    name: "GitLab CI",
    description: "GitLab 流水线",
    steps: [
      {
        title: "配置 .gitlab-ci.yml",
        description:
          "添加 CI/CD 变量：ARTIFACT_KEEPER_TOKEN 和 ARTIFACT_KEEPER_URL。",
        code: `# .gitlab-ci.yml
publish:
  stage: deploy
  script:
    - echo "Publishing to $ARTIFACT_KEEPER_URL"
    # Configure and publish your artifacts here
  only:
    - tags`,
      },
    ],
  },
  {
    key: "jenkins",
    name: "Jenkins",
    description: "Jenkins 流水线",
    steps: [
      {
        title: "配置 Jenkinsfile",
        description: "在 Jenkins 凭据管理器中存储凭据。",
        code: `// Jenkinsfile
pipeline {
    agent any
    environment {
        REGISTRY_CREDS = credentials('artifact-keeper')
    }
    stages {
        stage('Publish') {
            steps {
                sh '''
                    # Configure and publish your artifacts here
                '''
            }
        }
    }
}`,
      },
    ],
  },
  {
    key: "azure",
    name: "Azure DevOps",
    description: "Azure 流水线",
    steps: [
      {
        title: "配置 azure-pipelines.yml",
        description:
          "在项目设置中添加 Artifact Keeper 服务连接。",
        code: `# azure-pipelines.yml
trigger:
  tags:
    include:
      - 'v*'

pool:
  vmImage: 'ubuntu-latest'

steps:
  - script: |
      # Configure and publish your artifacts here
    env:
      REGISTRY_TOKEN: $(ARTIFACT_KEEPER_TOKEN)
    displayName: 'Publish to Artifact Keeper'`,
      },
    ],
  },
];

// -- format categories for filter --

const FORMAT_CATEGORIES: { key: string; label: string; formats: string[] }[] = [
  {
    key: "core",
    label: "核心",
    formats: ["maven", "gradle", "npm", "pypi", "nuget", "go", "cargo", "rubygems", "generic"],
  },
  {
    key: "container",
    label: "容器",
    formats: ["docker", "helm", "helm_oci", "podman", "buildx", "oras", "wasm_oci", "incus", "lxc"],
  },
  {
    key: "linux",
    label: "Linux",
    formats: ["debian", "rpm", "alpine", "opkg"],
  },
  {
    key: "ecosystem",
    label: "生态系统",
    formats: ["poetry", "conda", "yarn", "pnpm", "composer", "cocoapods", "swift", "hex", "pub", "sbt", "cran"],
  },
  {
    key: "infra",
    label: "基础设施",
    formats: ["terraform", "opentofu", "chef", "puppet", "ansible", "vagrant"],
  },
  {
    key: "other",
    label: "其他",
    formats: ["generic", "gitlfs", "bazel", "p2", "protobuf", "huggingface", "mlmodel", "vscode", "jetbrains"],
  },
];

// -- CodeBlock component --

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative group">
      <pre className="rounded-lg bg-muted border p-4 text-sm overflow-x-auto whitespace-pre-wrap break-all">
        <code>{code}</code>
      </pre>
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyButton value={code} />
      </div>
    </div>
  );
}

// -- StepsList component (numbered step list with code blocks) --

function StepsList({ steps }: { steps: SetupStep[] }) {
  return (
    <div className="space-y-6">
      {steps.map((step, i) => (
        <div key={i} className="space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
              {i + 1}
            </span>
            {step.title}
          </h4>
          {step.description && (
            <p className="text-sm text-muted-foreground ml-8">
              {step.description}
            </p>
          )}
          <div className="ml-8">
            <CodeBlock code={step.code} />
          </div>
        </div>
      ))}
    </div>
  );
}

// -- page --

export default function SetupPage() {
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<CICDPlatform | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const { data: repositoriesData } = useQuery({
    queryKey: ["repositories"],
    queryFn: () => repositoriesApi.list({ per_page: 100 }),
  });

  const repositories = repositoriesData?.items ?? [];

  // Filter repos by search and category
  const filteredRepos = useMemo(() => {
    let result = repositories;

    if (categoryFilter !== "all") {
      const category = FORMAT_CATEGORIES.find((c) => c.key === categoryFilter);
      if (category) {
        result = result.filter((r) => category.formats.includes(r.format));
      }
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.key.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          r.format.toLowerCase().includes(q)
      );
    }

    return result;
  }, [repositories, categoryFilter, search]);

  // Group filtered repos by format for display
  const reposByFormat = useMemo(() => {
    const map = new Map<string, Repository[]>();
    for (const repo of filteredRepos) {
      const key = repo.format;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(repo);
    }
    // Sort groups alphabetically
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredRepos]);

  const selectedContent: RepoSetupContent | null = selectedRepo
    ? getRepoSetupContent(selectedRepo)
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="安装指南"
        description="配置您的构建工具和 CI/CD 流水线以使用 Artifact Keeper。"
      />

      <Tabs defaultValue="repositories">
        <TabsList>
          <TabsTrigger value="repositories">
            <Package className="size-4" />
            仓库
          </TabsTrigger>
          <TabsTrigger value="cicd">
            <Rocket className="size-4" />
            CI/CD 平台
          </TabsTrigger>
        </TabsList>

        {/* -- Repositories Tab (main) -- */}
        <TabsContent value="repositories" className="mt-6 space-y-4">
          {/* Search + category filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="搜索仓库..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="size-4 text-muted-foreground shrink-0" />
            <Button
              variant={categoryFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setCategoryFilter("all")}
            >
              全部
            </Button>
            {FORMAT_CATEGORIES.map((cat) => (
              <Button
                key={cat.key}
                variant={categoryFilter === cat.key ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  setCategoryFilter(categoryFilter === cat.key ? "all" : cat.key)
                }
              >
                {cat.label}
              </Button>
            ))}
          </div>

          {/* Repos grouped by format */}
          {reposByFormat.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Package className="size-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  {repositories.length === 0
                    ? "暂无可用仓库，请先创建仓库。"
                    : "没有匹配筛选条件的仓库。"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {reposByFormat.map(([format, repos]) => (
                <div key={format}>
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="secondary" className="text-xs uppercase">
                      {format}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {repos.length} 个仓库
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {repos.map((repo) => (
                      <Card
                        key={repo.id}
                        className="cursor-pointer hover:border-primary/50 transition-colors"
                        onClick={() => setSelectedRepo(repo)}
                      >
                        <CardContent className="flex items-center gap-3 py-4">
                          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                            <Code className="size-5 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-sm truncate">
                              {repo.key}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {repo.name !== repo.key ? repo.name : repo.repo_type}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-xs shrink-0">
                            {repo.repo_type}
                          </Badge>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* -- CI/CD Platforms Tab -- */}
        <TabsContent value="cicd" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {CICD_PLATFORMS.map((platform) => (
              <Card
                key={platform.key}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setSelectedPlatform(platform)}
              >
                <CardContent className="text-center py-6">
                  <div className="flex items-center justify-center mb-3">
                    <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
                      <Rocket className="size-6 text-primary" />
                    </div>
                  </div>
                  <p className="font-semibold text-sm">{platform.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {platform.description}
                  </p>
                  <Button className="mt-3" size="sm" variant="outline">
                    开始使用
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* -- Repository Setup Dialog -- */}
      <Dialog
        open={!!selectedRepo}
        onOpenChange={(o) => {
          if (!o) setSelectedRepo(null);
        }}
      >
        <DialogContent className="sm:max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              设置：{selectedRepo?.key}
              <Badge variant="secondary" className="text-xs uppercase">
                {selectedRepo?.format}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              配置您的工具以使用{" "}
              <span className="font-medium text-foreground">{selectedRepo?.name}</span>{" "}
              仓库。
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            {selectedContent?.kind === "variants" ? (
              <Tabs defaultValue={selectedContent.defaultKey}>
                {/* h-auto + flex-wrap: 4 JVM client labels overflow at ~360px;
                    let them wrap to a second row on narrow viewports. */}
                <TabsList className="h-auto flex-wrap">
                  {selectedContent.variants.map((variant) => (
                    <TabsTrigger key={variant.key} value={variant.key}>
                      {variant.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {selectedContent.variants.map((variant) => (
                  <TabsContent
                    key={variant.key}
                    value={variant.key}
                    className="mt-4"
                  >
                    <StepsList steps={variant.steps} />
                  </TabsContent>
                ))}
              </Tabs>
            ) : selectedContent ? (
              <StepsList steps={selectedContent.steps} />
            ) : null}
          </ScrollArea>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>

      {/* -- CI/CD Platform Dialog -- */}
      <Dialog
        open={!!selectedPlatform}
        onOpenChange={(o) => {
          if (!o) setSelectedPlatform(null);
        }}
      >
        <DialogContent className="sm:max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{selectedPlatform?.name} 集成</DialogTitle>
            <DialogDescription>
              配置 {selectedPlatform?.name} 以向 Artifact Keeper 发布和消费制品。
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            {selectedPlatform && <StepsList steps={selectedPlatform.steps} />}
          </ScrollArea>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    </div>
  );
}
