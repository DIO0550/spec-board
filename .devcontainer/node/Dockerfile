FROM ubuntu:24.04

# Node.js バージョン
ARG NODE_VERSION=24
ARG USERNAME=vscode

ENV NODE_VERSION=${NODE_VERSION}
ENV DEBIAN_FRONTEND=noninteractive
ENV LANG=C.UTF-8

# 基本パッケージとNode.jsのインストール
# Tauri開発に必要なシステムライブラリも併せてインストール
RUN apt-get update \
    && apt-get install -y \
        curl \
        ca-certificates \
        gnupg \
        git \
        jq \
        tmux \
        vim-tiny \
        build-essential \
        pkg-config \
        libssl-dev \
        libwebkit2gtk-4.1-dev \
        libayatana-appindicator3-dev \
        librsvg2-dev \
        libxdo-dev \
        libsoup-3.0-dev \
        libjavascriptcoregtk-4.1-dev \
        file \
        wget \
        zip \
        unzip \
    && useradd -m -s /bin/bash $USERNAME \
    && curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://gist.githubusercontent.com/DIO0550/1830ced050035c34668aa426f7258346/raw/install-gh.sh | bash
RUN curl -fsSL https://gist.githubusercontent.com/DIO0550/16c39c3dc4682c7e2fd03c83d0f34b42/raw/install-playwright-deps.sh | bash

# Rust ツールチェイン (Tauri開発用)
# rust-devcontainer-template (claude/add-jq-installation-docker) を参考に
# vscode ユーザーが利用できるよう /usr/local/cargo にインストール
ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:$PATH

RUN set -eux; \
    mkdir -p "$RUSTUP_HOME" "$CARGO_HOME/registry" "$CARGO_HOME/git"; \
    curl -fsSL https://sh.rustup.rs | sh -s -- -y --no-modify-path --default-toolchain stable --profile minimal; \
    rustup component add rustfmt clippy rust-src; \
    chmod -R a+w "$RUSTUP_HOME" "$CARGO_HOME"; \
    rustc --version; \
    cargo --version

# Tauri CLI を事前にインストール
RUN cargo install tauri-cli --locked

USER $USERNAME

SHELL ["/bin/bash", "-l", "-c"]
RUN curl -fsSL https://gist.githubusercontent.com/DIO0550/dcc09dc9d2dcefceb9b0cda183e7ef8e/raw/pnpm-safe-chain-setup.sh | sh
RUN curl -fsSL https://gist.githubusercontent.com/DIO0550/148b1392cf435ba3562da0d398bee442/raw/install-ai-tools.sh | bash
RUN curl -fsSL https://gist.githubusercontent.com/DIO0550/356434ec2b182f71d99dc0c467555ba5/raw/tmux-setup.sh | bash
RUN curl -fsSL https://gist.githubusercontent.com/DIO0550/6e5249a1b3682e702c875851756f0373/raw/install-playwright.sh | bash


WORKDIR /workspace
