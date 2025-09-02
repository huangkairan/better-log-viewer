#!/bin/bash

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 获取当前版本
CURRENT_VERSION=$(grep '"version"' package.json | head -1 | awk -F'"' '{print $4}')

echo -e "${YELLOW}当前版本: ${CURRENT_VERSION}${NC}"
echo ""

# 检查工作目录是否干净
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${RED}错误: 工作目录不干净，请先提交或暂存更改${NC}"
    exit 1
fi

# 选择版本类型
echo "选择版本类型:"
echo "1) patch (0.1.0 -> 0.1.1)"
echo "2) minor (0.1.0 -> 0.2.0)"
echo "3) major (0.1.0 -> 1.0.0)"
echo "4) 自定义版本号"
read -p "请选择 (1-4): " choice

case $choice in
    1)
        VERSION_TYPE="patch"
        ;;
    2)
        VERSION_TYPE="minor"
        ;;
    3)
        VERSION_TYPE="major"
        ;;
    4)
        read -p "请输入新版本号 (例如: 1.2.3): " NEW_VERSION
        VERSION_TYPE="custom"
        ;;
    *)
        echo -e "${RED}无效选择${NC}"
        exit 1
        ;;
esac

# 计算新版本号
if [ "$VERSION_TYPE" != "custom" ]; then
    # 使用 npm version 计算新版本号（但不实际提交）
    NEW_VERSION=$(npm version $VERSION_TYPE --no-git-tag-version | sed 's/v//')
    # 恢复 package.json
    git checkout package.json
    # 手动更新版本号
    sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" package.json
fi

echo -e "${GREEN}新版本: ${NEW_VERSION}${NC}"

# 更新 tauri.conf.json 中的版本号
sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" src-tauri/tauri.conf.json

# 更新 Cargo.toml 中的版本号
sed -i '' "s/version = \"$CURRENT_VERSION\"/version = \"$NEW_VERSION\"/" src-tauri/Cargo.toml

echo -e "${YELLOW}正在更新 Cargo.lock...${NC}"
cd src-tauri
cargo check
cd ..

# 提交更改
echo -e "${YELLOW}正在提交版本更改...${NC}"
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: bump version to v${NEW_VERSION}"

# 创建标签
echo -e "${YELLOW}正在创建标签...${NC}"
git tag "v${NEW_VERSION}"

echo -e "${GREEN}版本 v${NEW_VERSION} 已准备就绪!${NC}"
echo ""
echo "接下来的步骤:"
echo "1. 检查更改: git log --oneline -n 3"
echo "2. 推送到远程: git push origin main && git push origin v${NEW_VERSION}"
echo "3. GitHub Actions 将自动构建和发布"