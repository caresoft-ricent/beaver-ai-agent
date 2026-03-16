#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="beaver-ai-agent"
OUTPUT_NAME="${PROJECT_NAME}-review"
ZIP_NAME="${OUTPUT_NAME}.zip"

echo "==> 开始打包项目审查包..."

if [ ! -d "$PROJECT_NAME" ]; then
  echo "错误：当前目录下未找到 $PROJECT_NAME"
  echo "请把脚本放在 $PROJECT_NAME 的同级目录执行"
  exit 1
fi

# 清理旧目录/旧压缩包
rm -rf "$OUTPUT_NAME"
rm -f "$ZIP_NAME"

# 创建精简目录
mkdir -p "$OUTPUT_NAME"

copy_if_exists() {
  local src="$1"
  local dst="$2"
  if [ -e "$src" ]; then
    echo "复制: $src -> $dst"
    cp -R "$src" "$dst"
  else
    echo "跳过不存在项: $src"
  fi
}

# 复制核心内容
copy_if_exists "$PROJECT_NAME/backend" "$OUTPUT_NAME/"
copy_if_exists "$PROJECT_NAME/frontend" "$OUTPUT_NAME/"
copy_if_exists "$PROJECT_NAME/docs" "$OUTPUT_NAME/"
copy_if_exists "$PROJECT_NAME/scripts" "$OUTPUT_NAME/"
copy_if_exists "$PROJECT_NAME/docker-compose.yml" "$OUTPUT_NAME/"
copy_if_exists "$PROJECT_NAME/.env.example" "$OUTPUT_NAME/"
copy_if_exists "$PROJECT_NAME/.gitignore" "$OUTPUT_NAME/"
copy_if_exists "$PROJECT_NAME/note.md" "$OUTPUT_NAME/"

echo "==> 删除无关/大体积/敏感内容..."

# 删除常见大目录、缓存、运行产物、敏感文件
find "$OUTPUT_NAME" -type d \( \
  -name node_modules -o \
  -name dist -o \
  -name build -o \
  -name target -o \
  -name .git -o \
  -name .idea -o \
  -name .vscode -o \
  -name .next -o \
  -name .nuxt -o \
  -name .cache -o \
  -name .pytest_cache -o \
  -name __pycache__ -o \
  -name .mypy_cache -o \
  -name .turbo -o \
  -name .output -o \
  -name coverage -o \
  -name logs -o \
  -name log -o \
  -name temp -o \
  -name tmp -o \
  -name .venv -o \
  -name venv -o \
  -name .vite \
\) -prune -exec rm -rf {} +

# 删除常见无关文件
find "$OUTPUT_NAME" -type f \( \
  -name ".DS_Store" -o \
  -name "*.log" -o \
  -name "*.pyc" -o \
  -name "*.pyo" -o \
  -name "*.class" -o \
  -name "*.jar" -o \
  -name "*.war" -o \
  -name "*.zip" -o \
  -name "*.tar" -o \
  -name "*.gz" -o \
  -name "*.sqlite" -o \
  -name "*.db" -o \
  -name "*.pid" \
\) -delete

# 删除可能误带进去的真实环境文件
find "$OUTPUT_NAME" -type f \( \
  -name ".env" -o \
  -name ".env.local" -o \
  -name ".env.production" -o \
  -name ".env.development" \
\) -delete

echo "==> 生成压缩包..."
zip -r "$ZIP_NAME" "$OUTPUT_NAME" >/dev/null

echo
echo "打包完成：$ZIP_NAME"
echo "你现在把这个 zip 上传给我即可。"
echo
echo "如果你想先检查压缩包内容，可以执行："
echo "unzip -l $ZIP_NAME | less"