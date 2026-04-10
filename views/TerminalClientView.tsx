import React, { useState, useEffect, useRef, memo, useCallback } from 'react';

interface TerminalConfig {
  serverId: string;
  serverPort: string;
  terminalName: string;
  terminalId: string;
  groupId?: string; // 新增：分组标识
  license: string;
}

// --- 核心工具：ID 归一化 (防止 Case/Prefix 导致的指令丢失) ---
const normalizeId = (id: string) => {
  if (!id) return '';
  let clean = id.toString().toUpperCase().trim();
  // [v7.8.5] 究极归一化：循环剥离所有已知前缀，确保最终只保留原始 ID 序列（如 01）
  while (clean.startsWith('TERM-') || clean.startsWith('NODE-')) {
    clean = clean.replace(/^TERM-/, '').replace(/^NODE-/, '');
  }
  return clean;
};

// HMAC-SHA256 算法 (Node.js 原生实现，解决浏览器 secure context 限制)
function computeHMAC(secret: string, message: string) {
  try {
    const crypto = window.require('crypto');
    return crypto.createHmac('sha256', secret).update(message).digest('hex');
  } catch (err) {
    console.error('HMAC Error:', err);
    return null;
  }
}

const SmoothMarquee = memo(({ text, color, fontSize, speed, bgColor, bgOpacity }: any) => {
  const duration = `${Math.max(2, 40 / (speed || 1))}s`;
  const rgbaBg = `${bgColor}${Math.round((bgOpacity || 0) * 2.55).toString(16).padStart(2, '0')}`;

  return (
    <div className="w-full h-full flex items-center overflow-hidden marquee-container" style={{ backgroundColor: rgbaBg }}>
      <div className="flex whitespace-nowrap will-change-transform animate-marquee-smooth marquee-text"
        style={{ color, fontSize: `${fontSize}px`, fontWeight: 900, animationDuration: duration }}>
        <span className="px-[10vw]">{text}</span>
        <span className="px-[10vw]">{text}</span>
      </div>
    </div>
  );
});

const EnhancedVideoPlayer = memo(({ src, fileName, layerId, onStatusChange, onModeChange }: {
  src: string, fileName?: string, layerId?: string, onStatusChange?: (status: string) => void, onModeChange?: (isLocal: boolean) => void
}) => {
  const [actualSrc, setActualSrc] = useState(src);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playAttempts = useRef(0);
  const maxAttempts = 15;
  const isPlaying = useRef(false);
  const lastPlayTime = useRef(Date.now());
  const loadAttempts = useRef(0);
  const maxLoadAttempts = 8;
  const isInitialized = useRef(false);
  const loadStartTime = useRef(Date.now());
  const maxLoadTime = 30000;

  useEffect(() => {
    onModeChange?.(actualSrc.startsWith('local-asset://'));
  }, [actualSrc, onModeChange]);

  const tryPlay = () => {
    if (!videoRef.current) return;
    playAttempts.current++;
    videoRef.current.play().then(() => {
      playAttempts.current = 0;
      isPlaying.current = true;
      lastPlayTime.current = Date.now();
      onStatusChange?.('Playing');
    }).catch(err => {
      if (playAttempts.current < maxAttempts) {
        setTimeout(tryPlay, Math.min(playAttempts.current * 2000, 10000));
      } else {
        onStatusChange?.('Failed');
      }
    });
  };

  const checkVideoExists = () => {
    if (actualSrc.startsWith('local-asset://')) {
      onStatusChange?.('Ready');
      tryPlay();
      return;
    }
    fetch(actualSrc, { method: 'HEAD' })
      .then(response => {
        if (response.ok) {
          onStatusChange?.('Ready');
          tryPlay();
        } else {
          onStatusChange?.('NotFound');
          if (loadAttempts.current < maxLoadAttempts) {
            loadAttempts.current++;
            setTimeout(() => { if (videoRef.current) { videoRef.current.load(); checkVideoExists(); } }, 3000);
          }
        }
      })
      .catch(() => {
        onStatusChange?.('NetworkError');
        if (loadAttempts.current < maxLoadAttempts) {
          loadAttempts.current++;
          setTimeout(() => { if (videoRef.current) { videoRef.current.load(); checkVideoExists(); } }, 3000);
        }
      });
  };

  useEffect(() => {
    const updateStatus = (status: string) => onStatusChange?.(status);
    const checkPlaybackStatus = () => {
      if (videoRef.current) {
        const currentTime = videoRef.current.currentTime;
        const paused = videoRef.current.paused;
        const readyState = videoRef.current.readyState;
        const currentTimeNow = Date.now();
        if (readyState === 0 && currentTimeNow - loadStartTime.current > maxLoadTime) {
          if (loadAttempts.current < maxLoadAttempts) {
            loadAttempts.current++;
            loadStartTime.current = currentTimeNow;
            videoRef.current.load();
            checkVideoExists();
          }
        }
        if (isPlaying.current && currentTimeNow - lastPlayTime.current > 20000) {
          tryPlay();
        }
        if (!paused && currentTime > 0) {
          lastPlayTime.current = currentTimeNow;
          updateStatus('Playing');
        } else if (paused) {
          updateStatus('Paused');
        }
      }
    };
    const statusInterval = setInterval(checkPlaybackStatus, 1500);
    return () => clearInterval(statusInterval);
  }, [layerId, onStatusChange]);

  // --- 逻辑加固：在线优先，异步本地化 ---
  useEffect(() => {
    let mounted = true;

    const checkLocal = async () => {
      try {
        if (!fileName) return;
        const { ipcRenderer } = window.require('electron');
        const isLocal = await ipcRenderer.invoke('check-asset-offline', fileName);
        if (isLocal && mounted) {
          const localUri = `local-asset://${encodeURIComponent(fileName)}`;
          if (actualSrc !== localUri) {
            setActualSrc(localUri);
          }
        } else if (mounted && actualSrc !== src) {
          // 如果本地失效或未下完，切回在线
          setActualSrc(src);
        }
      } catch (e) {
        if (mounted) setActualSrc(src);
      }
    };

    checkLocal();

    const handler = (_event: any, cachedFile: string) => {
      if (cachedFile === fileName && mounted) {
        setActualSrc(`local-asset://${encodeURIComponent(cachedFile)}`);
      }
    };

    try {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.on('asset-cached', handler);
      return () => {
        mounted = false;
        ipcRenderer.removeListener('asset-cached', handler);
      };
    } catch (e) {
      return () => { mounted = false; };
    }
  }, [src, fileName]);

  useEffect(() => {
    isInitialized.current = false;
    loadAttempts.current = 0;
    playAttempts.current = 0;
    loadStartTime.current = Date.now();
    const handleUserInteraction = () => {
      tryPlay();
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
    };
    document.addEventListener('click', handleUserInteraction);
    document.addEventListener('touchstart', handleUserInteraction);
    document.addEventListener('keydown', handleUserInteraction);
    if (videoRef.current) {
      videoRef.current.src = actualSrc;
      videoRef.current.load();
      checkVideoExists();
      isInitialized.current = true;
    }
    return () => {
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
    };
  }, [actualSrc]);

  return (
    <video
      ref={videoRef}
      key={actualSrc}
      src={actualSrc}
      autoPlay
      muted={true}
      playsInline
      loop
      preload="auto"
      crossOrigin="anonymous"
      width="100%"
      height="100%"
      style={{ display: 'block', objectFit: 'contain', willChange: 'transform', transform: 'translateZ(0)', backgroundColor: '#000' }}
      className="w-full h-full"
      onError={() => {
        // 关键修复：如果本地缓存文件损坏导致播放失败，自动尝试回滚到原始 HTTP 负载
        if (actualSrc.startsWith('local-asset://') && videoRef.current) {
          (window as any).electronAPI?.writeLog(`[Video] Local asset playback FAILED, falling back to network: ${fileName}`);
          videoRef.current.src = src; // 切回原始地址
          videoRef.current.load();
          return;
        }

        if (videoRef.current) {
          setTimeout(() => {
            loadAttempts.current++;
            if (loadAttempts.current < maxLoadAttempts) {
              videoRef.current?.load();
              checkVideoExists();
            }
          }, 2000);
        }
      }}
      onLoadedMetadata={() => tryPlay()}
      onStalled={() => tryPlay()}
      onWaiting={() => onStatusChange?.('Waiting')}
      onPlaying={() => {
        isPlaying.current = true;
        lastPlayTime.current = Date.now();
        onStatusChange?.('Playing');
      }}
      onPause={() => {
        setTimeout(() => {
          if (videoRef.current && videoRef.current.paused) tryPlay();
        }, 500);
      }}
      onLoadedData={() => tryPlay()}
      onCanPlay={() => tryPlay()}
    />
  );
});

const LocalImageRenderer = memo(({ src, fileName, md5, onModeChange }: { src: string, fileName: string, md5?: string, onModeChange?: (isLocal: boolean) => void }) => {
  const [actualSrc, setActualSrc] = useState(src);

  useEffect(() => {
    onModeChange?.(actualSrc.startsWith('local-asset://'));
  }, [actualSrc, onModeChange]);

  useEffect(() => {
    let mounted = true;
    const checkLocal = async () => {
      try {
        if (!fileName) return;
        const { ipcRenderer } = window.require('electron');
        const isLocal = await ipcRenderer.invoke('check-asset-offline', fileName, md5);
        if (isLocal && mounted) {
          setActualSrc(`local-asset:///${encodeURIComponent(fileName)}`);
        } else if (mounted) {
          setActualSrc(src);
        }
      } catch (e) {
        if (mounted) setActualSrc(src);
      }
    };
    checkLocal();

    const handler = (_event: any, cachedFile: string) => {
      if (cachedFile === fileName && mounted) {
        setActualSrc(`local-asset:///${encodeURIComponent(cachedFile)}`);
      }
    };

    try {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.on('asset-cached', handler);
      return () => {
        mounted = false;
        ipcRenderer.removeListener('asset-cached', handler);
      };
    } catch (e) {
      return () => { mounted = false; };
    }
  }, [src, fileName, md5]);

  return (
    <img
      src={actualSrc}
      className="w-full h-full object-contain"
      alt=""
      crossOrigin="anonymous"
      onError={() => {
        if (actualSrc.startsWith('local-asset://')) {
          setActualSrc(src); // 损坏回退
        }
      }}
    />
  );
});

const DocumentRenderer = memo(({ src, fileName, md5, rotation, onModeChange }: { src: string, fileName: string, md5?: string, rotation: number, onModeChange?: (isLocal: boolean) => void }) => {
  const [content, setContent] = useState<string>('');
  const isTxt = fileName.toLowerCase().endsWith('.txt');
  const isPdf = fileName.toLowerCase().endsWith('.pdf');
  const scrollRef = useRef<HTMLDivElement>(null);

  // PDF 自动翻页引擎：五帧“超级跑步机”模式 + 淡入淡出 (v7.8.2)
  const [slots, setSlots] = useState([
    { id: 0, page: 1, salt: Date.now(), active: false },
    { id: 1, page: 2, salt: Date.now() + 1, active: false },
    { id: 2, page: 3, salt: Date.now() + 2, active: false },
    { id: 3, page: 1, salt: Date.now() + 3, active: false },
    { id: 4, page: 1, salt: Date.now() + 4, active: false }
  ]);
  const [activeSlot, setActiveSlot] = useState(0);
  const [isReady, setIsReady] = useState(false); // 启动哨兵：探测成功后才挂载渲染层
  const [totalPage, setTotalPage] = useState(1);
  const [lastTotalPage, setLastTotalPage] = useState(0);
  const [actualSrc, setActualSrc] = useState(src);
  const pageCursorRef = useRef(1);
  const PDF_PAGE_INTERVAL = 20;
  const isPortraitMode = rotation === 90 || rotation === 270;

  // TXT 滚动状态
  const [scrollAmount, setScrollAmount] = useState(0);
  const [scrollDuration, setScrollDuration] = useState(30);
  // 离线化资源检查逻辑 (在线优先)
  useEffect(() => {
    onModeChange?.(actualSrc.startsWith('local-asset://'));
  }, [actualSrc, onModeChange]);

  // 离线化资源检查逻辑 (在线优先)
  useEffect(() => {
    let mounted = true;
    const checkLocal = async () => {
      try {
        const { ipcRenderer } = window.require('electron');
        // [v7.7.7] 引入 MD5 校验，校验不通过则强制回退至在线模式
        const isLocal = await ipcRenderer.invoke('check-asset-offline', fileName, md5);
        if (isLocal && mounted) {
          setActualSrc(`local-asset:///${encodeURIComponent(fileName)}`);
        } else if (mounted) {
          setActualSrc(src);
        }
      } catch (e) {
        if (mounted) setActualSrc(src);
      }
    };
    checkLocal();

    const handler = (_event: any, cachedFile: string) => {
      if (cachedFile === fileName && mounted) {
        setActualSrc(`local-asset:///${encodeURIComponent(cachedFile)}`);
      }
    };

    try {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.on('asset-cached', handler);
      return () => {
        mounted = false;
        ipcRenderer.removeListener('asset-cached', handler);
      };
    } catch (e) {
      return () => { mounted = false; };
    }
  }, [src, fileName, md5]);

  // 加载数据与 PDF 探测 (增强在线模式下的元数据估算)
  useEffect(() => {
    let mounted = true;
    if (isTxt && actualSrc) {
      const loadTxt = async () => {
        try {
          // 优先尝试 IPC 读取 (绕过 Fetch 对自定义协议的限制)
          if (actualSrc.startsWith('local-asset://')) {
            const { ipcRenderer } = window.require('electron');
            const data = await ipcRenderer.invoke('read-text-file', fileName);
            if (data && mounted) {
              setContent(data);
              return;
            }
          }

          const res = await fetch(actualSrc);
          const text = await res.text();
          if (mounted) setContent(text);
        } catch (err: any) {
          if (mounted) {
            setContent(`加载失败: ${err.message}`);
            (window as any).electronAPI?.writeLog(`TXT Load Error: ${err.message}`);
          }
        }
      };
      loadTxt();
    }
    if (isPdf) {
      const api = (window as any).electronAPI;
      const refreshCount = async () => {
        // [v7.7.2] 探测加固：5 次重试，间隔 2.5s，解决 01.pdf 写入锁定时无法获取页数的问题
        let retries = 5;
        const probe = async () => {
          try {
            const { ipcRenderer } = window.require('electron');
            const isLocal = await ipcRenderer.invoke('check-asset-offline', fileName);
            if (isLocal) {
              const count = await api?.getPdfPageCount?.(fileName);
              if (count && count > 0) {
                setTotalPage(count);
                setIsReady(true); // 探测成功，解除启动锁定
                return true;
              }
            }
          } catch (e) {
            console.error('[PDF Probe] Error:', e);
          }
          return false;
        };

        const success = await probe();
        if (!success && retries > 0) {
          const interval = setInterval(async () => {
            const ok = await probe();
            retries--;
            if (ok || retries <= 0) clearInterval(interval);
          }, 3000); // 增加探测间隔至 3s
        }
      };

      refreshCount();

      // 当资源缓存成功时，触发 PDF 页数重测
      try {
        const { ipcRenderer } = window.require('electron');
        const handler = (_event: any, cachedFile: string) => {
          if (cachedFile === fileName) refreshCount();
        };
        ipcRenderer.on('asset-cached', handler);
        return () => {
          mounted = false;
          ipcRenderer.removeListener('asset-cached', handler);
        };
      } catch (e) { }
    }
    return () => { mounted = false; };
  }, [isTxt, isPdf, actualSrc, fileName]);

  // TXT 自动滚动检测
  useEffect(() => {
    if (isTxt && content) {
      // 延时测量确保 DOM 已稳定渲染
      const timer = setTimeout(() => {
        if (scrollRef.current) {
          const el = scrollRef.current;
          const overflow = el.scrollHeight; // 获取真实总高度
          const viewHeight = window.innerHeight;
          if (overflow > viewHeight * 0.7) {
            setScrollAmount(overflow);
            // 速度平衡：每 60px 约 2 秒
            setScrollDuration(Math.max(15, Math.round(overflow / 60 * 2.5)));
          } else {
            setScrollAmount(0);
          }
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isTxt, content]);

  // 工具函数：生成稳定且包含分页 Hash 的 URL
  const getSlotUrl = (p: number, slotId: number, salt: number) => {
    let baseUrl = actualSrc.split('#')[0];
    if (baseUrl.startsWith('local-asset:')) {
      const fileNamePart = baseUrl.replace(/^local-asset:?\/+/, '').split('?')[0];
      baseUrl = `local-asset:///${fileNamePart}`;
    }
    const separator = baseUrl.includes('?') ? '&' : '?';
    // [v8.1] 竖屏用 FitH（宽度适配）让 PDF 填满宽度，超高部分由容器裁切；横屏保持 Fit（整页适配）
    const viewMode = isPortraitMode ? 'FitH' : 'Fit';
    return `${baseUrl}${separator}s=${slotId}&r=${salt}#page=${p}&navpanes=0&pagemode=none&view=${viewMode}&toolbar=0&scrollbar=0`;
  };

  // PDF 切换逻辑：五路物理 Treadmill + Cross-Fade 淡入淡出
  useEffect(() => {
    if (!isPdf || totalPage <= 1 || !isReady) return;

    if (totalPage !== lastTotalPage) {
      setSlots([
        { id: 0, page: 1, salt: Date.now(), active: true },
        { id: 1, page: 2, salt: Date.now() + 1, active: false },
        { id: 2, page: 3, salt: Date.now() + 2, active: false },
        { id: 3, page: 4, salt: Date.now() + 3, active: false },
        { id: 4, page: 5, salt: Date.now() + 4, active: false }
      ]);
      setActiveSlot(0);
      setLastTotalPage(totalPage);
      pageCursorRef.current = 1;
    }

    const engine = setInterval(() => {
      const currentIdx = pageCursorRef.current;
      const nextIdx = currentIdx >= totalPage ? 1 : currentIdx + 1;

      const p2 = nextIdx;
      const p3 = p2 >= totalPage ? 1 : p2 + 1;
      const p4 = p3 >= totalPage ? 1 : p3 + 1;
      const p5 = p4 >= totalPage ? 1 : p4 + 1;

      const currentSlot = activeSlot;
      const nextSlot = (activeSlot + 1) % 5;
      const slot2 = (activeSlot + 2) % 5;
      const slot3 = (activeSlot + 3) % 5;
      const slot4 = (activeSlot + 4) % 5;

      // 核心：Cross-Fade 调度
      // 1. 让下一帧变为 active (淡入开始)
      setSlots(prev => prev.map(s => {
        if (s.id === nextSlot) return { ...s, active: true };
        return s;
      }));
      setActiveSlot(nextSlot);
      pageCursorRef.current = nextIdx;

      // 2. 1.5s 后（淡入完成后）关闭上一帧的 active (淡出完成)
      setTimeout(() => {
        setSlots(prev => prev.map(s => {
          if (s.id === currentSlot) return { ...s, active: false };
          // 同步更新后续槽位的预载计划，赋予新 salt
          if (s.id === slot2) return { ...s, page: p3, salt: Date.now() + 10, active: false };
          if (s.id === slot3) return { ...s, page: p4, salt: Date.now() + 20, active: false };
          if (s.id === slot4) return { ...s, page: p5, salt: Date.now() + 30, active: false };
          return s;
        }));
      }, 1500);

    }, PDF_PAGE_INTERVAL * 1000);

    return () => clearInterval(engine);
  }, [isPdf, totalPage, fileName, lastTotalPage, activeSlot, actualSrc, isReady, isPortraitMode]);

  if (isPdf) {
    if (!isReady) return <div className="w-full h-full bg-black flex items-center justify-center text-white/20 text-xs animate-pulse">PDF_PREVIEW_RECOVERY...</div>;

    return (
      <div style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative', background: isPortraitMode ? '#2a2a2b' : '#000' }}>
        {slots.map((slot) => (
          <div
            key={`pdf-vp-v81-${slot.id}`}
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: slot.active ? 20 : 1,
              opacity: slot.active ? 1 : 0,
              visibility: (slot.active || activeSlot === slot.id) ? 'visible' : 'hidden',
              transition: 'opacity 1.0s linear'
            }}
          >
            {/* [v8.2] aspectRatio 容器回归：竖屏 A4 比例居中 + 灰边，横屏铺满 */}
            <div style={{
              position: 'relative',
              ...(isPortraitMode ? {
                width: '100%',
                maxHeight: '100%',
                aspectRatio: '210 / 297'
              } : {
                width: '100%',
                height: '100%'
              }),
              overflow: 'hidden',
              background: '#fff'
            }}>
              <iframe
                key={`pdf-s-v82-${slot.id}`}
                src={getSlotUrl(slot.page, slot.id, slot.salt)}
                style={{
                  position: 'absolute',
                  top: isPortraitMode ? 0 : -40,
                  left: 0,
                  width: '100%',
                  height: isPortraitMode ? '100%' : 'calc(100% + 40px)',
                  border: 'none',
                  pointerEvents: 'none'
                }}
                title={`PDF-Slot-${slot.id}`}
              />
            </div>
          </div>
        ))}

        {/* 统一页码指示器 */}
        <div style={{
          position: 'absolute', bottom: 30, right: 30, zIndex: 100,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)',
          color: '#fff', padding: '6px 16px', borderRadius: 30,
          fontSize: 10, fontWeight: 900, letterSpacing: 1.5,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
        }}>
          PAGE {pageCursorRef.current} / {totalPage} {isPortraitMode ? '(VERT-MODE)' : ''}
        </div>
      </div>
    );
  }

  // TXT：实现首尾相接的无缝无感滚动 (Infinite Marquee)
  if (isTxt) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: '#020617', zIndex: 5,
        overflow: 'hidden', display: 'flex', flexDirection: 'column'
      }}>
        <div
          ref={scrollRef}
          style={{
            width: '100%', color: '#f8fafc',
            fontFamily: '"Microsoft YaHei", "SimSun", "PingFang SC", sans-serif',
            lineHeight: 1.8, fontSize: 'clamp(12px, 2.4vmin, 24px)', fontWeight: 400,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', textAlign: 'center',
            willChange: 'transform', // 开启 GPU 硬件加速，解决掉帧卡顿
            animation: scrollAmount > 0 ? `txtMarquee ${scrollDuration}s linear infinite` : 'none'
          }}>
          {/* 渲染两份内容以实现无缝对接 */}
          <div className="txt-content-block">{content || '加载中...'}</div>
          {scrollAmount > 0 && <div className="txt-content-block" style={{ minHeight: '1.8em' }}>{content}</div>}
        </div>
      </div>
    );
  }


  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-white p-20 text-center">
      <div className="text-6xl mb-6">📄</div>
      <div className="text-2xl font-bold mb-2">{fileName}</div>
    </div>
  );
});

const WebLayerRenderer = memo(({ config, lWidth, lHeight }: any) => {
  const zoom = Number(config.zoom) || 1;
  const offX = Number(config.offsetX) || 0;
  const offY = Number(config.offsetY) || 0;
  const offUp = Number(config.offsetUp) || 0;
  const offLeft = Number(config.offsetLeft) || 0;

  const DESKTOP_W = 1920;
  const scale = (lWidth / DESKTOP_W) * zoom;

  const translateX = (offX - offLeft);
  const translateY = (offY - offUp);

  return (
    <div className="w-full h-full overflow-hidden bg-black relative">
      <div style={{
        width: `${DESKTOP_W}px`,
        height: `${(lHeight / lWidth) * DESKTOP_W}px`,
        transform: `scale(${scale}) translate3d(${translateX}px, ${translateY}px, 0)`,
        transformOrigin: '0 0',
        position: 'absolute'
      }}>
        <iframe
          src={config.url}
          scrolling="no"
          title="web-node"
          className="w-full h-[3000px] border-none"
          sandbox="allow-scripts allow-forms allow-popups"
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  );
});

export const TerminalClientView: React.FC<{ isEmbedded?: boolean }> = ({ isEmbedded }) => {
  const [config, setConfig] = useState<TerminalConfig>(() => {
    // 优先从 URL 参数中提取（由宿主程序注入）
    const params = new URLSearchParams(window.location.search);
    const urlTid = params.get('tid');
    const urlName = params.get('name');
    const urlGroup = params.get('group');
    const saved = localStorage.getItem('matrix_terminal_config');
    const baseConfig = saved ? JSON.parse(saved) : {
      serverId: window.location.hostname || '127.0.0.1',
      serverPort: '3003',
      terminalName: 'Lab_Terminal_Node',
      terminalId: `NODE-${Math.floor(Math.random() * 1000)}`,
      license: '',
      groupId: 'default'
    };

    // 如果 URL 参数存在，则覆盖配置（实现宿主 -> 网页的通信）
    // NOTE: 必须解密 URL 中的编码字符
    const isOfflineBoot = params.get('offline') === 'true';
    if (isOfflineBoot) {
      console.log('[Offline] Booted in OFFLINE mode, using local persistence.');
    }

    return {
      ...baseConfig,
      serverId: params.get('sip') || baseConfig.serverId,
      terminalId: urlTid ? decodeURIComponent(urlTid) : baseConfig.terminalId,
      terminalName: urlName ? decodeURIComponent(urlName) : baseConfig.terminalName,
      groupId: urlGroup ? decodeURIComponent(urlGroup) : (baseConfig.groupId || 'default'),
      isOfflineBoot
    };
  });

  const [deviceDna] = useState(() => {
    // 优先从 URL 的 dna 参数获取（由宿主程序注入真实 MAC）
    const params = new URLSearchParams(window.location.search);
    const urlDna = params.get('dna');
    if (urlDna) return urlDna;

    let saved = localStorage.getItem('matrix_device_dna');
    if (!saved) {
      saved = Array.from({ length: 6 }, () => Math.floor(Math.random() * 256).toString(16).toUpperCase().padStart(2, '0')).join(':');
      localStorage.setItem('matrix_device_dna', saved);
    }
    return saved;
  });

  const [isLicenseExpired, setIsLicenseExpired] = useState(false);
  const [licenseReason, setLicenseReason] = useState('');
  const nextNonceRef = useRef<string | null>(localStorage.getItem('matrix_last_nonce'));

  const [isConfigMode, setIsConfigMode] = useState(!localStorage.getItem('matrix_terminal_config'));

  const [playVersion, setPlayVersion] = useState(0);
  const triggerRefresh = () => setPlayVersion(v => v + 1);

  // 暴露给外部用于强制刷新
  useEffect(() => {
    (window as any).refreshPlayer = triggerRefresh;
    (window as any).lastPowerActionTime = 0; // [v7.8.5] 初始化电源排程脉冲锁

    // [v8.5.0] 物理网络状态监听
    const handleOnline = () => {
      console.log('[Network] System ONLINE detected, forcing link sync.');
      (window as any).triggerHeartbeat?.();
    };
    const handleOffline = () => {
      console.log('[Network] System OFFLINE detected, entering local isolation.');
      setStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const [status, setStatus] = useState<'connected' | 'offline'>('offline');
  const [terminalStatus, setTerminalStatus] = useState<string>('Initializing');
  const [videoStatus, setVideoStatus] = useState<Record<string, string>>({});
  const [isLocalMode, setIsLocalMode] = useState(false); // 全局缓存状态指示器

  const [playlist, setPlaylist] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('matrix_cache_playlist');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.log('Failed to load playlist from localStorage:', e);
      return [];
    }
  });

  const safeSetPlaylist = (data: any) => {
    let list = data;
    // 自动解包嵌套格式: { playlist: [...] }
    if (data && !Array.isArray(data) && Array.isArray(data.playlist)) {
      list = data.playlist;
    }

    if (Array.isArray(list)) {
      setPlaylist(list);
      try {
        localStorage.setItem('matrix_cache_playlist', JSON.stringify(list));
        console.log(`[Sync] Playlist updated, length: ${list.length}`);
      } catch (e) { console.error('Storage error:', e); }
    } else {
      console.warn('Invalid playlist data received (not an array):', data);
      // 如果数据包含 rotation/volume 等字段但被误发为 PLAY_LIST，尝试静默分流（可选）
    }
  };
  const [tasks, setTasks] = useState<any[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('matrix_cache_tasks') || '[]');
    } catch (e) {
      console.log('Failed to load tasks from localStorage:', e);
      return [];
    }
  });
  const [templates, setTemplates] = useState<any[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('matrix_cache_templates') || '[]');
    } catch (e) {
      console.log('Failed to load templates from localStorage:', e);
      return [];
    }
  });
  const [broadcast, setBroadcast] = useState<any>(() => {
    try {
      return JSON.parse(localStorage.getItem('matrix_cache_broadcast') || 'null');
    } catch (e) {
      console.log('Failed to load broadcast from localStorage:', e);
      return null;
    }
  });
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeTask, setActiveTask] = useState<any>(null);
  const [activeBroadcastTask, setActiveBroadcastTask] = useState<any>(null);
  const [volume, setVolume] = useState(50);
  const [rotation, setRotation] = useState<number>(() => {
    return Number(localStorage.getItem('matrix_terminal_rotation') || '0');
  });
  const [isPowerOff, setIsPowerOff] = useState(false);
  const [logQueue, setLogQueue] = useState<string[]>([]); // 日志采集队列
  const [layerIndices, setLayerIndices] = useState<Record<string, number>>({});
  const lastCacheCleanTime = useRef<number>(0); // NOTE: 防止 cache 任务每 5 秒重复执行清理
  const [appVersion, setAppVersion] = useState<string>('0.0.0');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncCount, setSyncCount] = useState(0);
  const [displayLogs, setDisplayLogs] = useState<boolean>(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // [v7.9.1] 强制旋转恢复：防止启动瞬时逻辑竞争导致角度丢失
    const savedRot = localStorage.getItem('matrix_terminal_rotation');
    if (savedRot !== null) {
      const rot = Number(savedRot);
      if (rotation !== rot) {
        console.log('[System] Restoring rotation from persistence:', rot);
        setRotation(rot);
      }
    }
  }, []);

  useEffect(() => {
    try {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.invoke('get-app-version').then((v: string) => {
        setAppVersion(v);
        localStorage.setItem('matrix_cache_version', v);
      });
    } catch (e) { }
  }, []);

  const API_BASE = (config.serverId && config.serverPort)
    ? `http://${config.serverId}:${config.serverPort}`
    : '';
  const API_STREAM = `${API_BASE}/api/assets/stream?filename=`;

  // [v7.9.4] 真实物理快照捕捉 (基于 Electron 原生 capturePage)
  useEffect(() => {
    const captureAndUpload = async () => {
      try {
        const api = (window as any).electronAPI;
        if (!api || !api.capturePage) return;

        // 1. 获取窗口真实原始截图 (Base64)
        const rawData = await api.capturePage();
        if (!rawData) return;

        // 2. 创建处理画布：强制输出 16:9/4:3 横向比例，消除两边黑边
        const processCanvas = document.createElement('canvas');
        const pCtx = processCanvas.getContext('2d');
        if (!pCtx) return;

        // 无论实机怎么旋转，我们都希望输出一张“横着”占满监控框的图
        // 目标监控框尺寸建议 (640x360)
        processCanvas.width = 640;
        processCanvas.height = 360;

        const img = new Image();
        img.onload = () => {
          // 清空
          pCtx.fillStyle = '#000';
          pCtx.fillRect(0, 0, 640, 360);

          pCtx.save();
          // [Logic 3.0] 如果当前终端是旋转模式 (90/270)
          // capturePage 拿到的是旋转后的“竖屏”物理图。
          // 我们需要将其“转回去”横着放，使其占满监控框容器。
          // [v8.0.0] 预览回归物理真实：不再强行旋转填满 16:9 框
          // 直接将原始截图居中绘制进预览画布，保留真实比例（所见即所得）
          const s = Math.min(640 / img.width, 360 / img.height);
          const dw = img.width * s;
          const dh = img.height * s;
          const dx = (640 - dw) / 2;
          const dy = (360 - dh) / 2;
          pCtx.drawImage(img, dx, dy, dw, dh);
          pCtx.restore();

          // 追加状态水印 (不随截图旋转)
          pCtx.fillStyle = 'rgba(2, 6, 23, 0.7)';
          pCtx.fillRect(0, 330, 640, 30);
          pCtx.fillStyle = '#38bdf8';
          pCtx.font = 'bold 10px monospace';
          pCtx.textAlign = 'center';
          pCtx.fillText(`REAL-SNAPSHOT | ID: ${normalizeId(config.terminalId)} | ROT: ${rotation}° | ${new Date().toLocaleString()}`, 320, 348);

          const finalBlob = processCanvas.toDataURL('image/jpeg', 0.8);
          fetch(`${API_BASE}/api/terminals/snapshot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ terminalId: config.terminalId, imageBase64: finalBlob })
          }).catch(e => console.error('Snapshot upload error:', e));
        };
        img.src = rawData;
      } catch (e) {
        console.error('Snapshot capture failed:', e);
      }
    };

    const timer = setInterval(captureAndUpload, 10000);
    captureAndUpload();
    return () => clearInterval(timer);
  }, [config.terminalId, rotation, playlist, activeIndex, API_BASE]);

  // 监听来自 Electron 主进程的日志
  // NOTE: preload.js 已兼容 contextIsolation:false，统一使用 electronAPI
  useEffect(() => {
    const handler = (message: string) => {
      const time = new Date().toLocaleTimeString();
      setLogQueue(prev => [...prev.slice(-199), `${time} ${message}`]);
    };

    const api = (window as any).electronAPI;
    if (api && api.onPlayerLog) {
      const cleanup = api.onPlayerLog(handler);
      return cleanup;
    }

    // 最后兜底：直接 require
    try {
      const { ipcRenderer } = window.require('electron');
      const ipcHandler = (_e: any, msg: string) => handler(msg);
      ipcRenderer.on('player-log', ipcHandler);
      return () => ipcRenderer.removeListener('player-log', ipcHandler);
    } catch (e) {
      console.warn('[System] All IPC Log bridges failed');
    }
  }, []);

  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const templateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- 4K 离线缓存同步引擎 (核心架构增强) ---
  useEffect(() => {
    let syncTimer: any;
    const runSync = async () => {
      try {
        const { ipcRenderer } = window.require('electron');

        // 1. 扫描当前清单与任务中包含的所有素材
        const assetSet = new Set<string>();
        const currentIdNorm = normalizeId(config.terminalId);

        if (Array.isArray(playlist)) {
          playlist.forEach(item => {
            const name = item.content?.asset || item.name;
            if (name) assetSet.add(name);
          });
        }
        if (Array.isArray(tasks)) {
          tasks.forEach(task => {
            // [v8.2] 修正：仅同步属于本终端的任务素材
            const targetsNorm = (task.targets || [task.terminalId] || []).map((id: string) => normalizeId(id));
            if (!targetsNorm.includes(currentIdNorm)) return;

            // NOTE: 仅 asset 类型任务才有需要缓存的素材文件
            if (task.type === 'asset' && task.content?.asset) {
              assetSet.add(task.content.asset);
            }
          });
        }

        // 2. 扫描模板内的分层素材 (仅限已分配给本终端的任务中的模板)
        if (Array.isArray(templates)) {
          // 找出当前终端正在执行的任务关联的模板 ID
          const activeTplIds = tasks
            .filter(t => {
              const targetsNorm = (t.targets || [t.terminalId] || []).map((id: string) => normalizeId(id));
              return t.status === 'active' && t.type === 'template' && targetsNorm.includes(currentIdNorm);
            })
            .map(t => t.content?.templateId);

          templates.forEach(tpl => {
            if (!activeTplIds.includes(tpl.id)) return; // 仅下载分配给本终端的模板素材

            tpl.layers?.forEach((l: any) => {
              if (l.type === 'media') {
                const list = l.config?.playlist || l.playlist || [];
                list.forEach((m: any) => { if (m.name) assetSet.add(m.name); });
              }
            });
          });
        }

        // 3. 执行差异化增量下载
        const assets = Array.from(assetSet);
        const toDownload = [];
        for (const fileName of assets) {
          const isLocal = await ipcRenderer.invoke('check-asset-offline', fileName);
          if (!isLocal) toDownload.push(fileName);
        }

        if (toDownload.length > 0) {
          setIsSyncing(true);
          setSyncCount(toDownload.length);
          console.log(`[Cache Sync] Auditing ${assets.length} assets, downloading ${toDownload.length} missing...`);

          for (const fileName of toDownload) {
            const downloadUrl = `${API_BASE}/api/assets/stream?filename=${encodeURIComponent(fileName)}`;
            ipcRenderer.send('download-asset', { url: downloadUrl, fileName });
          }
        } else {
          setIsSyncing(false);
          setSyncCount(0);
        }
      } catch (e) {
        // 非 Electron 环境静默退出
      }
    };

    // 仅在数据就绪且非配置模式下运行
    if (!isConfigMode && (playlist.length > 0 || tasks.length > 0)) {
      runSync();
      // 每 5 分钟深度审计一次缓存
      syncTimer = setInterval(runSync, 5 * 60 * 1000);
    }
    return () => { if (syncTimer) clearInterval(syncTimer); };
  }, [playlist, tasks, templates, API_BASE, isConfigMode]);

  const parseDuration = (dur: any): number => {
    if (typeof dur === 'number') return dur;
    if (!dur) return 15;
    // 加固：支持服务器下播的各种时间对象格式 (minutes/seconds/min/sec)
    // 强制转换为数字避免 NaN
    const h = Number(dur.h || dur.hours || 0);
    const m = Number(dur.m || dur.min || dur.minutes || 0);
    const s = Number(dur.s || dur.sec || dur.seconds || 0);
    const total = h * 3600 + m * 60 + s;
    return isNaN(total) || total <= 0 ? 15 : total;
  };

  useEffect(() => {
    const updateMonitorStatus = () => {
      try {
        const currentItem = playlist[activeIndex];
        const currentStatus = {
          timestamp: new Date().toISOString(),
          connection: status,
          activeIndex,
          currentItem: currentItem ? {
            name: currentItem.name || currentItem.content?.asset,
            type: currentItem.type,
            duration: parseDuration(currentItem.duration)
          } : 'None',
          playlistLength: playlist.length,
          activeTask: activeTask ? activeTask.name : 'None',
          templatesCount: templates.length,
          tasksCount: tasks.length,
          layerIndices: Object.keys(layerIndices).length,
          videoStatus: videoStatus,
          memoryUsage: (performance as any).memory ? Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024) + 'MB' : 'N/A'
        };

        const statusStr = `Connected: ${status} | Playing: ${currentItem?.name || currentItem?.content?.asset || 'None'} | Tasks: ${tasks.length} | Templates: ${templates.length} | Video: ${Object.keys(videoStatus).length > 0 ? Object.entries(videoStatus).map(([id, status]) => `${id}:${status}`).join(', ') : 'Idle'}`;
        setTerminalStatus(statusStr);
        console.log('[Terminal Status]', currentStatus);
      } catch (err) {
        console.error('Monitor update error:', err);
      }
    };

    updateMonitorStatus(); // 立即执行一次
    const monitorInterval = setInterval(updateMonitorStatus, 5000);
    return () => clearInterval(monitorInterval);
  }, [status, activeIndex, playlist, templates, tasks, activeTask]); // 现在依赖完整的对象，确保任何变更都能触发更新

  useEffect(() => {
    const engine = setInterval(() => {
      try {
        const now = new Date();
        const currentH = now.getHours().toString().padStart(2, '0');
        const currentM = now.getMinutes().toString().padStart(2, '0');
        const currentTime = `${currentH}:${currentM}`;
        const day = now.getDay() === 0 ? 6 : now.getDay() - 1;

        const activeMatches = tasks.filter(t => {
          const isStatusActive = t.status === 'active';
          const currentIdNorm = normalizeId(config.terminalId);
          // [v7.8.5] 统一 ID 归一化逻辑，确保排程精准命中
          const targetsNorm = (t.targets || [t.terminalId] || []).map((id: string) => normalizeId(id));
          const isTargetMatch = targetsNorm.includes(currentIdNorm);

          let isDayMatch = true;
          if (t.frequency === 'weekly' && t.selectedDays) {
            isDayMatch = t.selectedDays.includes(day);
          }
          const isTimeMatch = currentTime >= t.startTime && currentTime <= t.endTime;
          return isStatusActive && isTargetMatch && isDayMatch && isTimeMatch;
        });

        // 分离主任务 (asset/template) 与 叠加任务 (broadcast)
        const primaryMatch = activeMatches.find(t => t.type === 'asset' || t.type === 'template');
        const broadcastMatch = activeMatches.find(t => t.type === 'broadcast');

        // [v7.8.5] 脉冲任务锁：确保电源与清理任务在设定分钟内仅执行一次
        const currentMinuteMarker = Math.floor(Date.now() / 60000);

        // Power 类型任务 (脉冲触发)
        const powerMatch = tasks.find(t => {
          if (t.type !== 'power' || t.status !== 'active') return false;
          const isTimePointMatch = currentTime === t.startTime;
          let isDayMatch = true;
          if (t.frequency === 'weekly' && t.selectedDays) isDayMatch = t.selectedDays.includes(day);
          const targetsNorm = (t.targets || [t.terminalId] || []).map((id: string) => normalizeId(id));
          const isTargetMatch = targetsNorm.includes(normalizeId(config.terminalId));
          return isTargetMatch && isDayMatch && isTimePointMatch;
        });

        if (powerMatch && currentMinuteMarker > (window as any).lastPowerActionTime) {
          (window as any).lastPowerActionTime = currentMinuteMarker;
          const action = powerMatch.content?.powerAction;
          console.log('[Matrix Engine] Pulse Power Action Triggered:', action);
          try {
            const { ipcRenderer } = window.require('electron');
            const cmd = action === '开机' ? 'on' : action === '关机' ? 'off' : 'reboot';
            ipcRenderer.send('terminal-power', cmd);
          } catch (e) { }
        }

        // cache 类型任务 — 单点脉冲触发（仅在 startTime 时刻触发单次清理）
        const cacheMatch = tasks.find(t => {
          if (t.type !== 'cache' || t.status !== 'active') return false;
          const isTimePointMatch = currentTime === t.startTime;
          let isDayMatch = true;
          if (t.frequency === 'weekly' && t.selectedDays) isDayMatch = t.selectedDays.includes(day);
          const targetsNorm = (t.targets || [t.terminalId] || []).map((id: string) => normalizeId(id));
          const isTargetMatch = targetsNorm.includes(normalizeId(config.terminalId));
          return isTargetMatch && isDayMatch && isTimePointMatch;
        });

        // 如果匹配到清理时间点且进入了新的分钟周期
        if (cacheMatch && currentMinuteMarker > lastCacheCleanTime.current) {
          lastCacheCleanTime.current = currentMinuteMarker;
          try {
            const { ipcRenderer } = window.require('electron');
            const protectedFiles: string[] = [];
            playlist.forEach((item: any) => {
              if (item.name) protectedFiles.push(item.name);
              if (item.content?.asset) protectedFiles.push(item.content.asset);
            });
            templates.forEach((tpl: any) => {
              tpl.layers?.forEach((l: any) => {
                if (l.type === 'media') {
                  (l.config?.playlist || []).forEach((m: any) => { if (m.name) protectedFiles.push(m.name); });
                }
              });
            });
            ipcRenderer.invoke('clear-local-cache', { protectedFiles }).then((result: any) => {
              console.log('[Matrix Engine] Pulse Cache Cleanup Triggered:', result);
            });
          } catch (e) { }
        }

        if (JSON.stringify(primaryMatch) !== JSON.stringify(activeTask)) {
          setActiveTask(primaryMatch || null);
          console.log('[Matrix Engine] Primary Strategy switched:', primaryMatch ? `Task: ${primaryMatch.name}` : 'Default Playlist');
        }

        if (JSON.stringify(broadcastMatch) !== JSON.stringify(activeBroadcastTask)) {
          setActiveBroadcastTask(broadcastMatch || null);
          if (broadcastMatch) console.log('[Matrix Engine] Broadcast Overlay matched:', broadcastMatch.name);
        }
      } catch (e) {
        console.error('Task Engine error:', e);
      }
    }, 5000);

    return () => clearInterval(engine);
  }, [tasks, activeTask, activeBroadcastTask, config.terminalId]);

  useEffect(() => {
    if (isConfigMode) return;

    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    if (templateIntervalRef.current) {
      clearInterval(templateIntervalRef.current);
      templateIntervalRef.current = null;
    }

    const heartbeatFunc = async () => {
      try {
        let hmac = null;
        if (nextNonceRef.current && config.license) {
          try {
            // 授权密文格式: SIGNATURE|BASE64_PAYLOAD
            // PAYLOAD 格式: PROJECT_NAME:EXPIRY:QUOTA:SECRET
            const parts = config.license.split('|');
            if (parts.length >= 2) {
              const payloadB64 = parts[1];
              // 关键修复：必须 decode Base64 才能拿到真正的 SECRET 原始值
              const payload = window.atob(payloadB64);
              const payloadParts = payload.split(':');
              const secret = payloadParts[3]; // 第 4 位是 SECRET

              if (secret) {
                hmac = computeHMAC(secret, nextNonceRef.current + deviceDna);
              }
            }
          } catch (err) {
            console.error('[Security] HMAC Secret extract failed:', err);
          }
        }

        // 使用物理配置中的 ID，确保与服务器登记的一致
        const currentTid = config.terminalId || deviceDna;
        const finalApiBase = API_BASE || `http://${window.location.hostname}:3003`;

        const res = await fetch(`${finalApiBase}/api/terminals/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            terminalId: currentTid,
            mac: deviceDna,
            hmac: hmac,
            nonce: nextNonceRef.current,
            version: localStorage.getItem('matrix_cache_version'),
            logs: logQueue, // 上报采集到的日志
            status: {
              name: config.terminalName,
              groupId: config.groupId,
              state: isPowerOff ? 'offline' : 'online'
            }
          })
        });
        if (res.ok) {
          setLogQueue([]); // 上送成功后清空队列
          const data = await res.json();
          // 更新 Nonce 用于下一次握手
          if (data.nonce) {
            nextNonceRef.current = data.nonce;
            localStorage.setItem('matrix_last_nonce', data.nonce);
          }
          setIsLicenseExpired(false);
          // ... 原有逻辑继续 ...
          console.log('[Pulse] Heartbeat Success:', data);
          if (data.commands && data.commands.length > 0) {
            console.log(`[Pulse] New Commands from Server:`, data.commands.map((c: any) => c.command));
            data.commands.forEach((cmd: any) => {
              if (cmd.command === 'PLAY_LIST') {
                console.log('Received PLAY_LIST command:', cmd.payload);
                safeSetPlaylist(cmd.payload);
                triggerRefresh(); // 收到新指令，强制重置播放状态
              }
              if (cmd.command === 'UPDATE_TASKS') {
                console.log('Received UPDATE_TASKS command:', cmd.payload);
                setTasks(cmd.payload);
                triggerRefresh();
                try {
                  localStorage.setItem('matrix_cache_tasks', JSON.stringify(cmd.payload));
                  console.log('Successfully saved tasks to localStorage');
                } catch (e) {
                  console.error('Failed to save tasks to localStorage:', e);
                }
              }
              if (cmd.command === 'SET_BROADCAST') {
                console.log('Received SET_BROADCAST command:', cmd.payload);

                // [debug] 指令识别：静默开启调试模式，不渲染跑马灯
                if (cmd.payload?.text?.includes('[debug]')) {
                  console.log('[Debug] Entering silent debug mode');
                  localStorage.setItem('matrix_debug_mode', 'true');
                  // 不设置 broadcast，跑马灯不会显示
                  return;
                }
                if (cmd.payload?.text?.includes('[no debug]')) {
                  console.log('[Debug] Exiting debug mode');
                  localStorage.setItem('matrix_debug_mode', 'false');
                  return;
                }

                setBroadcast(cmd.payload);
                try {
                  localStorage.setItem('matrix_cache_broadcast', JSON.stringify(cmd.payload));
                } catch (e) { }
              }
              if (cmd.command === 'CLEAR_CACHE') {
                console.log('[System] Received remote CLEAR_CACHE command');
                try {
                  const { ipcRenderer } = window.require('electron');

                  // 收集当前正在播放/使用的文件名，防止被删除
                  const protectedFiles: string[] = [];

                  // 1. 当前播放列表中的素材
                  playlist.forEach((item: any) => {
                    if (item.name) protectedFiles.push(item.name);
                    if (item.content?.asset) protectedFiles.push(item.content.asset);
                  });

                  // 2. 模板中的素材
                  templates.forEach((tpl: any) => {
                    tpl.layers?.forEach((l: any) => {
                      if (l.type === 'media') {
                        const list = l.config?.playlist || [];
                        list.forEach((m: any) => { if (m.name) protectedFiles.push(m.name); });
                      }
                    });
                  });

                  console.log(`[Cache] Protected files: ${protectedFiles.length}`);
                  ipcRenderer.invoke('clear-local-cache', { protectedFiles }).then((result: any) => {
                    console.log('[System] Smart cache cleanup result:', result);
                  });
                } catch (e) { }
              }
              if (cmd.command === 'SET_VOLUME') setVolume(cmd.payload);
              if (cmd.command === 'SET_ROTATION') {
                const rot = Number(cmd.payload);
                setRotation(rot);
                localStorage.setItem('matrix_terminal_rotation', rot.toString());
              }

              if (cmd.command === 'POWER_OFF') {
                console.log('[Power] Triggering POWER_OFF');
                setIsPowerOff(true);
                try {
                  const { ipcRenderer } = window.require('electron');
                  ipcRenderer.send('terminal-power', 'off');
                } catch (e) { console.warn('IPC failed'); }
              }

              if (cmd.command === 'POWER_ON') {
                console.log('[Power] Triggering POWER_ON (Reboot)');
                setIsPowerOff(false); // 立即标记为在线，虽然即将重启
                try {
                  const { ipcRenderer } = window.require('electron');
                  ipcRenderer.send('terminal-power', 'on');
                } catch (e) { console.warn('IPC failed'); }
              }

              if (cmd.command === 'REBOOT') {
                console.log('[Power] Triggering REBOOT');
                try {
                  const { ipcRenderer } = window.require('electron');
                  ipcRenderer.send('terminal-power', 'reboot');
                } catch (e) { window.location.reload(); }
              }
              if (cmd.command === 'UPGRADE_APP') {
                console.log('[System] Received UPGRADE_APP command:', cmd.payload);
                try {
                  const { ipcRenderer } = window.require('electron');
                  // NOTE: 服务端下发的是相对路径 /api/assets/stream?filename=xxx
                  // http.get() 需要完整 URL，这里拼接 API_BASE
                  const fullUrl = cmd.payload.url?.startsWith('http')
                    ? cmd.payload.url
                    : `${API_BASE}${cmd.payload.url}`;
                  ipcRenderer.send('upgrade-app', { ...cmd.payload, url: fullUrl });
                } catch (e) { }
              }
            });
          }
          setStatus('connected');
        } else if (res.status === 402 || res.status === 403) {
          const errData = await res.json();
          setIsLicenseExpired(true);
          setLicenseReason(errData.reason || errData.message || '授权过期或额度已满');
          setStatus('offline');
        } else {
          setStatus('offline');
        }
      } catch (e) { setStatus('offline'); }
    };

    (window as any).triggerHeartbeat = heartbeatFunc;
    const heartbeat = setInterval(heartbeatFunc, 5000);

    const syncResources = setInterval(async () => {
      try {
        const [taskRes, tplRes] = await Promise.all([
          fetch(`${API_BASE}/api/tasks`),
          fetch(`${API_BASE}/api/templates`)
        ]);
        if (taskRes.ok) {
          const tData = await taskRes.json();
          console.log('Received tasks data:', tData);
          setTasks(tData);
          try {
            localStorage.setItem('matrix_cache_tasks', JSON.stringify(tData));
            console.log('Successfully saved tasks to localStorage');
          } catch (e) {
            console.error('Failed to save tasks to localStorage:', e);
          }
        }
        if (tplRes.ok) {
          const tplData = await tplRes.json();
          console.log('Received templates data:', tplData);
          setTemplates(tplData);
          try {
            localStorage.setItem('matrix_cache_templates', JSON.stringify(tplData));
            console.log('Successfully saved templates to localStorage');
          } catch (e) {
            console.error('Failed to save templates to localStorage:', e);
          }
        }
      } catch (e) {
        console.error('Failed to sync resources:', e);
      }
    }, 30000);

    const initialPull = async () => {
      if ((config as any).isOfflineBoot) {
        setStatus('offline');
        return;
      }
      try {
        console.log('Starting initial data pull...');
        const finalApiBase = API_BASE || `http://${window.location.hostname}:3003`;
        const res = await fetch(`${finalApiBase}/api/terminals/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            terminalId: config.terminalId,
            version: localStorage.getItem('matrix_cache_version'),
            status: {
              name: config.terminalName,
              groupId: config.groupId,
              state: isPowerOff ? 'offline' : 'online'
            }
          })
        });
        if (res.ok) {
          const data = await res.json();
          console.log('Received initial data:', data);
          if (data.commands) {
            data.commands.forEach((cmd: any) => {
              if (cmd.command === 'PLAY_LIST') {
                console.log('Initial PLAY_LIST command:', cmd.payload);
                safeSetPlaylist(cmd.payload);
                triggerRefresh();
              }
              if (cmd.command === 'SET_BROADCAST') {
                console.log('Initial SET_BROADCAST command:', cmd.payload);
                setBroadcast(cmd.payload);
                try {
                  localStorage.setItem('matrix_cache_broadcast', JSON.stringify(cmd.payload));
                  console.log('Successfully saved initial broadcast to localStorage');
                } catch (e) {
                  console.error('Failed to save initial broadcast to localStorage:', e);
                }
              }
            });
          }
        }
      } catch (e) {
        console.error('Failed to perform initial pull:', e);
      }
    };
    initialPull();

    return () => { clearInterval(heartbeat); clearInterval(syncResources); };
  }, [config, isConfigMode]);

  useEffect(() => {
    if (activeTask || !Array.isArray(playlist) || playlist.length === 0) {
      if (activeIndex !== 0) setActiveIndex(0);
      return;
    }

    // 保护性检查：NaN 或越界
    if (isNaN(activeIndex) || activeIndex >= playlist.length || activeIndex < 0) {
      setActiveIndex(0);
      return;
    }

    const item = playlist[activeIndex];
    if (!item) return;

    const duration = parseDuration(item.duration);
    const timer = setTimeout(() => {
      setActiveIndex(prev => {
        const next = (prev + 1) % playlist.length;
        triggerRefresh(); // 无论是否切换素材（即使是单素材循环），只要周期到期就强制重置状态
        return isNaN(next) ? 0 : next;
      });
    }, duration * 1000);
    return () => clearTimeout(timer);
  }, [activeIndex, playlist.length, activeTask]);

  useEffect(() => {
    const layerTimers: Record<string, ReturnType<typeof setTimeout>> = {};
    const videoElements: Record<string, HTMLVideoElement> = {};

    const preloadVideo = (src: string, layerId: string) => {
      if (videoElements[layerId]) {
        videoElements[layerId].src = src;
        videoElements[layerId].load();
      } else {
        const video = document.createElement('video');
        video.src = src;
        video.preload = 'auto';
        video.muted = true;
        videoElements[layerId] = video;
      }
    };

    const setupActiveTemplateTimers = () => {
      // 获取当前活动的节点
      const currentNode = activeTask || (playlist.length > 0 ? playlist[activeIndex] : null);
      if (!currentNode) return;

      // 仅当节点是模板类型时才处理
      if (currentNode.type === 'template' || currentNode.type === 'template_task') {
        const tplId = currentNode.refId || currentNode.content?.templateId;
        const tpl = templates.find(t => t.id === tplId);
        if (!tpl) return;

        tpl.layers?.forEach((l: any) => {
          if (l.type === 'media') {
            const list = l.config?.playlist || l.playlist || [];
            if (list.length > 1) {
              const playNext = (currentIndex: number) => {
                const nextIndex = (currentIndex + 1) % list.length;
                console.log(`[Layer ${l.id}] Next item: ${nextIndex}`);

                if (list[nextIndex]?.type === 'VID') {
                  preloadVideo(API_STREAM + encodeURIComponent(list[nextIndex].name), l.id);
                }

                setLayerIndices(prev => ({ ...prev, [l.id]: nextIndex }));

                const currentItem = list[nextIndex]; // 基于切换后的索引获取持续时间
                const duration = parseDuration(currentItem?.duration || 15);
                layerTimers[l.id] = setTimeout(() => playNext(nextIndex), duration * 1000);
              };

              // 启动定时器（仅当尚未设置时，或者这里我们可以用简单的策略）
              // 为了避免循环，我们使用 setTimeout 而不是在此处直接 setLayerIndices
              const idx = layerIndices[l.id] || 0;
              const currentItem = list[idx];
              const duration = parseDuration(currentItem?.duration || 15);

              layerTimers[l.id] = setTimeout(() => playNext(idx), duration * 1000);
            }
          }
        });
      }
    };

    setupActiveTemplateTimers();

    return () => {
      Object.values(layerTimers).forEach(timer => clearTimeout(timer));
      Object.values(videoElements).forEach(video => {
        video.pause();
        video.src = '';
      });
    };
  }, [activeTask, activeIndex, playlist.length, templates]); // 移除 layerIndices 依赖以免死循环

  const renderActiveNode = (node: any) => {
    // 旋转后的逻辑尺寸
    const isRotated = rotation === 90 || rotation === 270;
    const logicW = isRotated ? window.innerHeight : window.innerWidth;
    const logicH = isRotated ? window.innerWidth : window.innerHeight;
    if (!node || node.type === 'broadcast') return null;

    if (node.type === 'template' || node.type === 'template_task') {
      const tplId = node.refId || node.content?.templateId;
      const tpl = templates.find(t => t.id === tplId);
      if (!tpl) return <div className="bg-black w-full h-full flex items-center justify-center text-white/10 italic">SYNCING_TEMPLATE...</div>;

      const isPortrait = tpl.orientation === 'portrait';
      const tplW = isPortrait ? 1080 : 1920;
      const tplH = isPortrait ? 1920 : 1080;

      // 计算最适缩放比
      const scale = Math.min(logicW / tplW, logicH / tplH);

      return (
        <div className="w-full h-full flex items-center justify-center bg-black overflow-hidden">
          <div
            style={{
              width: `${tplW}px`,
              height: `${tplH}px`,
              backgroundColor: tpl.bgConfig?.value,
              transform: `scale(${scale})`,
              transformOrigin: 'center center',
              flexShrink: 0
            }}
            className="relative overflow-hidden"
          >
            {tpl.layers?.sort((a: any, b: any) => (a.z || 0) - (b.z || 0)).map((l: any) => (
              <div key={l.id} className="absolute overflow-hidden"
                style={{
                  left: `${l.x}%`,
                  top: `${l.y}%`,
                  width: `${l.w}%`,
                  height: `${l.h}%`,
                  zIndex: l.z,
                  opacity: (l.opacity !== undefined ? l.opacity : 100) / 100
                }}>
                {l.type === 'media' && (
                  <div className="w-full h-full bg-black">
                    {((l.config?.playlist || l.playlist || [])[layerIndices[l.id] || 0])?.type === 'VID' ? (
                      <EnhancedVideoPlayer
                        src={API_STREAM + encodeURIComponent(((l.config?.playlist || l.playlist || [])[layerIndices[l.id] || 0]).name)}
                        fileName={((l.config?.playlist || l.playlist || [])[layerIndices[l.id] || 0]).name}
                        layerId={l.id}
                        onStatusChange={(status) => {
                          setVideoStatus(prev => ({ ...prev, [l.id]: status }));
                        }}
                      />
                    ) : (((l.config?.playlist || l.playlist || [])[layerIndices[l.id] || 0])?.type === 'PDF' || ((l.config?.playlist || l.playlist || [])[layerIndices[l.id] || 0])?.name?.match(/\.(pdf|txt)$/i)) ? (
                      <DocumentRenderer
                        src={API_STREAM + encodeURIComponent(((l.config?.playlist || l.playlist || [])[layerIndices[l.id] || 0]).name)}
                        fileName={((l.config?.playlist || l.playlist || [])[layerIndices[l.id] || 0]).name}
                        md5={((l.config?.playlist || l.playlist || [])[layerIndices[l.id] || 0]).md5}
                        rotation={rotation}
                      />
                    ) : (
                      <LocalImageRenderer
                        src={API_STREAM + encodeURIComponent(((l.config?.playlist || l.playlist || [])[layerIndices[l.id] || 0])?.name || '')}
                        fileName={((l.config?.playlist || l.playlist || [])[layerIndices[l.id] || 0])?.name || ''}
                        md5={((l.config?.playlist || l.playlist || [])[layerIndices[l.id] || 0])?.md5}
                      />
                    )}
                  </div>
                )}
                {l.type === 'text' && (
                  <SmoothMarquee
                    text={l.config.content}
                    color={l.config.color}
                    fontSize={l.config.size}
                    speed={l.config.speed}
                    bgColor={l.config.bgColor}
                    bgOpacity={l.config.bgOpacity}
                  />
                )}
                {l.type === 'web' && (
                  <WebLayerRenderer config={l.config} lWidth={(l.w / 100) * tplW} lHeight={(l.h / 100) * tplH} />
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    // 针对不同类型的节点解析真实的资源名称
    const mediaName = node.content?.asset || node.name;
    const isVideo = mediaName?.match(/\.(mp4|webm|ogg|mov|mkv)$/i);
    const isDoc = mediaName?.match(/\.(pdf|txt|ppt|pptx|doc|docx)$/i);

    return (
      <div className="w-full h-full bg-black relative flex items-center justify-center">
        {mediaName ? (
          isVideo ? (
            <EnhancedVideoPlayer
              src={API_STREAM + encodeURIComponent(mediaName)}
              fileName={mediaName}
              layerId={node.id || 'direct-media'}
              onStatusChange={(status) => {
                setVideoStatus(prev => ({ ...prev, [node.id || 'direct-media']: status }));
              }}
              onModeChange={setIsLocalMode}
            />
          ) : isDoc ? (
            <DocumentRenderer
              src={API_STREAM + encodeURIComponent(mediaName)}
              fileName={mediaName}
              md5={node.content?.md5 || node.md5}
              rotation={rotation}
              onModeChange={setIsLocalMode}
            />
          ) : (
            <LocalImageRenderer
              src={API_STREAM + encodeURIComponent(mediaName)}
              fileName={mediaName}
              md5={node.content?.md5 || node.md5}
              onModeChange={setIsLocalMode}
            />
          )
        ) : (
          <div className="text-white/20 text-sm animate-pulse">NO_MEDIA_CONTENT</div>
        )}
      </div>
    );
  };

  const renderContent = () => {
    if (isPowerOff) {
      return <div className="fixed inset-0 bg-black z-[10000]" />;
    }

    const isRotated = rotation === 90 || rotation === 270;

    // 计算旋转后的逻辑宽高
    const logicStyle: React.CSSProperties = isRotated ? {
      width: '100vh',
      height: '100vw',
    } : {
      width: '100vw',
      height: '100vh',
    };

    return (
      <div
        className="fixed left-1/2 top-1/2 transition-all duration-1000 ease-in-out flex items-center justify-center overflow-hidden bg-black"
        style={{
          ...logicStyle,
          transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
          transformOrigin: 'center center'
        }}
      >
        <div ref={contentRef} className="w-full h-full relative overflow-hidden media-node-enter" key={activeTask ? `task-${activeTask.id}` : (playlist && playlist[activeIndex] ? `play-${playlist[activeIndex].id || activeIndex}` : 'empty')}>
          {activeTask ? (
            renderActiveNode(activeTask)
          ) : (
            playlist && playlist.length > 0 && playlist[activeIndex] ? (
              renderActiveNode(playlist[activeIndex])
            ) : (
              <div className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-slate-900 to-black text-white/10 uppercase tracking-[1em] text-4xl font-black">
                {isLicenseExpired ? <span className="text-rose-600">Locked</span> : 'Standby'}
                <span className="text-[10px] tracking-normal mt-4 opacity-50 font-normal">
                  {isLicenseExpired ? `SECURITY_ALERT: ${licenseReason}` : `READY_FOR_SYNC | ID: ${config.terminalId}`}
                </span>
                {isLicenseExpired && (
                  <button onClick={() => setIsConfigMode(true)} className="mt-8 px-8 py-3 bg-white/5 border border-white/10 rounded-full text-[10px] text-white/40 hover:text-white transition-colors tracking-widest">
                    RE-ACTIVATE SYSTEM
                  </button>
                )}
              </div>
            )
          )}

          {/* 广播公告移入旋转容器，确保其始终在画面的视觉底部 */}
          {/* 广播公告：排程公告优先于手动下发公告 */}
          {(activeBroadcastTask?.content?.broadcast || broadcast) && (
            <div className={`absolute bottom-0 left-0 right-0 z-[9999] py-8 border-t border-white/5 overflow-hidden`}
              style={{ backgroundColor: `${(activeBroadcastTask?.content?.broadcast || broadcast).bgColor}${Math.round(((activeBroadcastTask?.content?.broadcast || broadcast).bgOpacity || 90) * 2.55).toString(16).padStart(2, '0')}` }}>
              <SmoothMarquee
                text={(activeBroadcastTask?.content?.broadcast || broadcast).text}
                color={(activeBroadcastTask?.content?.broadcast || broadcast).color}
                fontSize={(activeBroadcastTask?.content?.broadcast || broadcast).fontSize}
                speed={(activeBroadcastTask?.content?.broadcast || broadcast).speed}
                bgColor="transparent"
                bgOpacity={0}
              />
            </div>
          )}
        </div>
      </div>
    );
  };
  return (
    <div className="h-screen w-screen bg-black overflow-hidden relative font-sans">
      {renderContent()}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes txtMarquee {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(0, -50%, 0); }
        }
        .media-node-enter {
          animation: fadeIn 0.8s ease-out forwards;
        }
      `}</style>

      <div className="fixed top-0 left-0 w-64 h-32 px-8 flex flex-col items-start justify-center text-[9px] font-black text-white/40 z-[10001] opacity-0 hover:opacity-100 transition-opacity cursor-pointer bg-black/20 backdrop-blur-md rounded-br-3xl border-b border-r border-white/5" onClick={() => {
        if (isEmbedded) return;
        setIsConfigMode(true);
      }}>
        <div className="flex flex-col gap-1 w-full">
          <div className="flex items-center gap-3">
            <span className="text-white/60">{new Date().toLocaleTimeString()}</span>
            <span className="text-white/60">{config.terminalName || config.terminalId}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className={`w-1.5 h-1.5 rounded-full ${status === 'connected' ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
            <span className={status === 'connected' ? 'text-emerald-500' : 'text-rose-500'}>{status.toUpperCase()}</span>
            <span className={`px-1.5 py-0.5 rounded text-[8px] border ${isLocalMode ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}`}>
              {isLocalMode ? 'OFFLINE_CACHE' : 'CLOUD_LINKING'}
            </span>
          </div>
          {activeTask && <div className="text-sky-500 truncate mt-1">TASK: {activeTask.name}</div>}
          {isSyncing && <div className="text-emerald-500 animate-pulse mt-1">SYNCING: {syncCount}</div>}
          <div className="text-amber-500 mt-1 uppercase">S: {terminalStatus} | VOL: {volume}%</div>
        </div>
      </div>





      {isConfigMode && (
        <div className="fixed inset-0 bg-[#020617] flex items-center justify-center p-8 z-[10000] animate-in fade-in zoom-in-95 duration-500">
          <div className="w-full max-w-md bg-slate-900 border border-white/5 p-12 rounded-[3.5rem] space-y-8">
            <h3 className="text-2xl font-black text-white italic tracking-tighter">物理节点链路配置</h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="block text-white/60 text-sm font-medium">后端物理节点地址</label>
                <input type="text" defaultValue={config.serverId} id="host" className="w-full h-14 px-6 bg-black border border-white/10 rounded-2xl text-white outline-none focus:border-sky-500" placeholder="10.0.0.2" />
              </div>
              <div className="space-y-2">
                <label className="block text-white/60 text-sm font-medium">后端物理节点端口</label>
                <input type="text" defaultValue={config.serverPort} id="port" className="w-full h-14 px-6 bg-black border border-white/10 rounded-2xl text-white outline-none focus:border-sky-500" placeholder="3000" />
              </div>
              <div className="space-y-2">
                <label className="block text-white/60 text-sm font-medium">终端物理 ID (仅允许字母数字)</label>
                <div className="flex items-center gap-0">
                  <span className="h-14 px-4 bg-slate-800 border border-white/10 border-r-0 rounded-l-2xl flex items-center font-mono font-bold text-white/50">NODE-</span>
                  <input
                    type="text"
                    defaultValue={config.terminalId.replace(/^NODE-/i, '')}
                    id="terminalId"
                    className="flex-1 h-14 px-6 bg-black border border-white/10 rounded-r-2xl text-white outline-none focus:border-sky-500 font-mono"
                    placeholder="01"
                    onInput={(e) => {
                      const input = e.target as HTMLInputElement;
                      input.value = input.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                    }}
                  />
                </div>
                <p className="text-[9px] text-white/30">完整 ID 将为: NODE-{config.terminalId.replace(/^NODE-/i, '') || 'XX'}</p>
              </div>
              <div className="space-y-2">
                <label className="block text-white/60 text-sm font-medium">终端业务显示名称</label>
                <input type="text" defaultValue={config.terminalName} id="terminalName" className="w-full h-14 px-6 bg-black border border-white/10 rounded-2xl text-white outline-none focus:border-sky-500" placeholder="展厅默认节点" />
              </div>
              <div className="space-y-2">
                <label className="block text-white/60 text-sm font-medium">通信协议同步码 (Project License)</label>
                <div className="flex items-center gap-2">
                  <input type="password" defaultValue={config.license} id="license" className="flex-1 h-14 px-6 bg-black border border-white/10 rounded-2xl text-white outline-none focus:border-sky-500 font-mono" placeholder="请粘贴数据队..." />
                  <button
                    type="button"
                    onClick={() => document.getElementById('license-file-input')?.click()}
                    className="h-14 px-4 bg-slate-800 hover:bg-slate-700 border border-white/10 rounded-2xl text-white/60 hover:text-white text-xs font-bold transition-colors"
                  >
                    导入
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(deviceDna);
                        alert(`已复制硬件指纹: ${deviceDna}`);
                      } catch (e) {
                        alert('复制失败，请手动复制');
                      }
                    }}
                    className="h-14 px-4 bg-slate-800 hover:bg-slate-700 border border-white/10 rounded-2xl text-white/60 hover:text-white text-xs font-bold transition-colors"
                  >
                    复制DNA
                  </button>
                </div>
                <input
                  type="file"
                  id="license-file-input"
                  accept=".dat,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (evt) => {
                        const content = evt.target?.result as string;
                        if (content) {
                          (document.getElementById('license') as HTMLInputElement).value = content.trim();
                        }
                      };
                      reader.readAsText(file);
                    }
                  }}
                />
                <p className="text-[9px] text-white/20">系统硬件摘要 (DNA): {deviceDna}</p>
              </div>
              <button onClick={() => {
                const idInput = (document.getElementById('terminalId') as HTMLInputElement).value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                if (!idInput) {
                  alert('终端 ID 不能为空');
                  return;
                }
                const c = {
                  ...config,
                  serverId: (document.getElementById('host') as HTMLInputElement).value,
                  serverPort: (document.getElementById('port') as HTMLInputElement).value,
                  terminalId: `NODE-${idInput}`, // 统一添加 NODE- 前缀
                  terminalName: (document.getElementById('terminalName') as HTMLInputElement).value,
                  license: (document.getElementById('license') as HTMLInputElement).value
                };
                localStorage.setItem('matrix_terminal_config', JSON.stringify(c));

                // 物理固化：同步更新 Electron 主进程配置文件，防止重启后被启动参数覆盖
                try {
                  const { ipcRenderer } = window.require('electron');
                  ipcRenderer.send('save-setup', c);
                } catch (e) {
                  console.warn('[Config] Non-electron environment, skipping physical solidification');
                  window.location.reload();
                }
              }} className="w-full h-16 bg-sky-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-sky-600/20 transition-all active:scale-95">固化链路并挂载</button>
            </div>
            <button onClick={() => setIsConfigMode(false)} className="w-full text-slate-500 text-[10px] font-black uppercase tracking-widest">取消配置</button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes marqueeSmooth {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-50%, 0, 0); }
        }
        .animate-marquee-smooth {
          animation: marqueeSmooth linear infinite;
        }
        ::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
};
