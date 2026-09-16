FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive LANG=C.UTF-8
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl dbus-x11 \
       fluxbox novnc websockify x11vnc xvfb xauth x11-utils libnss3-tools \
       fonts-liberation fonts-noto-core procps \
    && curl -fsSL https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -o /tmp/chrome.deb \
    && apt-get install -y --no-install-recommends /tmp/chrome.deb \
    && rm -f /tmp/chrome.deb \
    && rm -rf /var/lib/apt/lists/*
RUN groupadd -g 1001 fsmanual && useradd -m -d /home/operator -u 1001 -g 1001 -s /bin/bash fsmanual \
    && chmod 0700 /home/operator
COPY --chmod=0755 start.sh /usr/local/bin/start-manual-desktop
USER fsmanual
WORKDIR /home/operator
CMD ["/usr/local/bin/start-manual-desktop"]
