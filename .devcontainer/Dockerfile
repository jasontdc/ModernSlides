FROM mcr.microsoft.com/devcontainers/javascript-node:5-24-trixie

# Install Electron system dependencies and X11 display tools
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get install -y --no-install-recommends \
        libnspr4 \
        libnss3 \
        libatk1.0-0 \
        libatk-bridge2.0-0 \
        libcups2 \
        libgtk-3-0 \
        libgbm1 \
        libasound2 \
        # Additional packages to support GUI apps, IPC, and X11 forwarding
        libx11-xcb1 \
        libxcb-dri3-0 \
        libdrm2 \
        libxss1 \
        libxtst6 \
        x11-apps \
        mesa-utils \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*