(() => {
  const stageRoots = Array.from(document.querySelectorAll('[data-kb-graph-root]'));
  if (stageRoots.length === 0) return;

  const PUBLIC_GROUPS = new Set(['topic', 'post']);
  const groupAliases = {
    concept: 'topic',
    topic: 'topic',
    post: 'post',
  };
  const dashedRelations = new Set(['related', 'alternative', 'tradeoff', 'merge', 'split', 'rename', 'complementary']);
  const emptyGraph = { nodes: [], edges: [] };

  let g6Loader = null;

  const renderEmptyState = (mount, message) => {
    mount.textContent = '';
    const empty = document.createElement('div');
    empty.className = 'kb-graph-empty';
    empty.textContent = message;
    mount.appendChild(empty);
  };

  const loadG6 = (src) => {
    if (window.G6 && window.G6.Graph) return Promise.resolve(window.G6);
    if (g6Loader) return g6Loader;

    g6Loader = new Promise((resolve, reject) => {
      if (!src) {
        reject(new Error('Missing G6 source.'));
        return;
      }

      const finishLoad = () => {
        if (window.G6 && window.G6.Graph) {
          resolve(window.G6);
          return;
        }
        reject(new Error('G6 loaded without a Graph constructor.'));
      };

      const failLoad = () => reject(new Error('G6 failed to load.'));
      const existing = document.querySelector('script[data-kb-g6-loader]');

      if (existing) {
        const status = existing.dataset.kbG6Status;
        if (status === 'loaded') {
          finishLoad();
          return;
        }
        if (status === 'failed') {
          failLoad();
          return;
        }
        existing.addEventListener('load', finishLoad, { once: true });
        existing.addEventListener('error', failLoad, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.kbG6Loader = 'true';
      script.dataset.kbG6Status = 'loading';
      script.addEventListener(
        'load',
        () => {
          script.dataset.kbG6Status = 'loaded';
          finishLoad();
        },
        { once: true }
      );
      script.addEventListener(
        'error',
        () => {
          script.dataset.kbG6Status = 'failed';
          failLoad();
        },
        { once: true }
      );
      document.head.appendChild(script);
    }).catch((error) => {
      g6Loader = null;
      throw error;
    });

    return g6Loader;
  };

  const hasGraphPayload = (value) => (
    Boolean(value)
      && typeof value === 'object'
      && (Array.isArray(value.nodes) || Array.isArray(value.edges))
  );

  const pickGraphPayload = (value) => {
    if (!value || typeof value !== 'object') return emptyGraph;

    const candidates = [
      value.public,
      value.publicGraph,
      value.public_graph,
      value.graph?.public,
      value.graphs?.public,
      value,
    ];

    return candidates.find((candidate) => hasGraphPayload(candidate)) || emptyGraph;
  };

  const normalizeGroup = (group) => {
    const key = String(group || '').trim().toLowerCase();
    return groupAliases[key] || key;
  };

  const relationColor = (relation) => {
    const palette = {
      explains: 'rgba(0, 88, 190, 0.28)',
      mentions: 'rgba(100, 116, 139, 0.32)',
      related: 'rgba(15, 118, 110, 0.34)',
      alternative: 'rgba(0, 88, 190, 0.44)',
      complementary: 'rgba(15, 118, 110, 0.44)',
      merge: 'rgba(99, 102, 241, 0.42)',
      rename: 'rgba(168, 85, 247, 0.42)',
      split: 'rgba(217, 119, 6, 0.42)',
      tradeoff: 'rgba(190, 24, 93, 0.42)',
    };
    return palette[relation] || 'rgba(181, 196, 217, 0.78)';
  };

  const colorForGroup = (group) => {
    const palette = {
      topic: '#0058be',
      post: '#0f766e',
    };
    return palette[group] || '#64748b';
  };

  const shadowForGroup = (group) => {
    const palette = {
      topic: 'rgba(0, 88, 190, 0.18)',
      post: 'rgba(15, 118, 110, 0.14)',
    };
    return palette[group] || 'rgba(100, 116, 139, 0.12)';
  };

  const sizeForNode = (node) => {
    if (node.group === 'topic') return Math.max(24, Math.min(Number(node.size) || 30, 42));
    if (node.group === 'post') return 16;
    return 12;
  };

  const labelWidthForNode = (node) => {
    if (node.group === 'topic') return 180;
    if (node.group === 'post') return 220;
    return 140;
  };

  const labelSizeForNode = (node) => {
    if (node.group === 'topic') return 12;
    if (node.group === 'post') return 11;
    return 10;
  };

  const initializeStage = async (stage) => {
    if (stage.dataset.kbGraphReady === 'true') return;
    stage.dataset.kbGraphReady = 'true';

    const mount = stage.querySelector('.kb-graph');
    const dataElement = stage.querySelector('.kb-graph-data');
    const tooltip = stage.querySelector('.kb-graph-tooltip');
    const tooltipKind = stage.querySelector('.kb-graph-tooltip-kind');
    const tooltipTitle = stage.querySelector('.kb-graph-tooltip-title');
    const tooltipSummary = stage.querySelector('.kb-graph-tooltip-summary');
    const tooltipLink = stage.querySelector('.kb-graph-tooltip-link');
    const tooltipClose = stage.querySelector('.kb-graph-tooltip-close');
    let legendButtons = Array.from(stage.querySelectorAll('[data-kb-legend-group]'));

    if (!mount || !dataElement || !tooltip || !tooltipKind || !tooltipTitle || !tooltipSummary || !tooltipLink) {
      return;
    }

    const groupLabels = {
      topic: stage.dataset.kbTopicLabel || 'Topic',
      post: stage.dataset.kbPostLabel || 'Post',
    };
    const messages = {
      parseError: stage.dataset.kbParseErrorMessage || 'Could not parse graph data.',
      empty: stage.dataset.kbEmptyMessage || 'No public graph is available yet.',
      loadError: stage.dataset.kbLoadErrorMessage || 'G6 failed to load.',
      initError: stage.dataset.kbInitErrorMessage || 'G6 failed to initialize.',
      filterEmpty: stage.dataset.kbFilterEmptyMessage || 'No public nodes match this filter.',
      renderError: stage.dataset.kbRenderErrorMessage || 'Could not render graph.',
    };
    const fallbackSummaries = {
      topic: stage.dataset.kbTopicFallbackSummary || 'This public topic is part of the graph.',
      post: stage.dataset.kbPostFallbackSummary || 'This public post is part of the graph.',
      generic: stage.dataset.kbGenericFallbackSummary || 'This node is part of the public graph.',
    };
    const fallbackSummary = (node) => {
      if (!node) return '';
      if (node.group === 'topic') return fallbackSummaries.topic;
      if (node.group === 'post') return fallbackSummaries.post;
      return fallbackSummaries.generic;
    };

    let raw = {};
    try {
      raw = JSON.parse(dataElement.textContent || '{}');
      if (typeof raw === 'string') raw = JSON.parse(raw);
    } catch (_error) {
      renderEmptyState(mount, messages.parseError);
      return;
    }

    const payload = pickGraphPayload(raw);
    const rawNodes = Array.isArray(payload.nodes) ? payload.nodes.filter((node) => node && node.id) : [];
    const rawEdges = Array.isArray(payload.edges) ? payload.edges.filter((edge) => edge && edge.source && edge.target) : [];

    const publicNodes = rawNodes
      .map((node) => ({
        ...node,
        group: normalizeGroup(node.group || node.kind || node.type),
      }))
      .filter((node) => PUBLIC_GROUPS.has(node.group));

    const publicNodeIds = new Set(publicNodes.map((node) => node.id));
    const publicEdges = rawEdges.filter((edge) => publicNodeIds.has(edge.source) && publicNodeIds.has(edge.target));

    if (publicNodes.length === 0) {
      renderEmptyState(mount, messages.empty);
      return;
    }

    try {
      await loadG6(stage.dataset.kbG6Url || '');
    } catch (_error) {
      renderEmptyState(mount, messages.loadError);
      return;
    }

    if (!window.G6 || !window.G6.Graph) {
      renderEmptyState(mount, messages.initError);
      return;
    }

    legendButtons = legendButtons
      .map((button) => {
        const normalizedGroup = normalizeGroup(button.getAttribute('data-kb-legend-group'));
        if (!PUBLIC_GROUPS.has(normalizedGroup)) {
          button.hidden = true;
          button.setAttribute('aria-hidden', 'true');
          return null;
        }

        button.setAttribute('data-kb-legend-group', normalizedGroup);
        const label = button.querySelector('strong');
        if (label) label.textContent = groupLabels[normalizedGroup] || normalizedGroup;
        return button;
      })
      .filter(Boolean);

    const siteRoot = document.body?.dataset?.siteRoot || '/';
    const resolveSiteUrl = (url) => {
      if (!url) return '';
      if (/^[a-z]+:/i.test(url) || url.startsWith('//')) return url;
      if (!url.startsWith('/')) return url;
      if (siteRoot === '/') return url;
      return `${siteRoot.replace(/\/$/, '')}${url}`;
    };

    const graphData = {
      nodes: publicNodes.map((node) => {
        const size = sizeForNode(node);
        return {
          id: node.id,
          type: 'circle',
          data: {
            name: node.name || node.id,
            title: node.title || node.name || node.id,
            url: node.group === 'post' ? resolveSiteUrl(node.url || '') : '',
            group: node.group,
            groupLabel: node.group_label || groupLabels[node.group] || node.group,
            summary: node.summary || fallbackSummary(node),
          },
          style: {
            size,
            fill: colorForGroup(node.group),
            stroke: '#ffffff',
            lineWidth: 2,
            shadowBlur: node.group === 'topic' ? 12 : 0,
            shadowColor: shadowForGroup(node.group),
            labelText: node.name || node.id,
            labelPlacement: 'bottom',
            labelOffsetY: 8,
            labelMaxWidth: labelWidthForNode(node),
            labelWordWrap: true,
            labelFill: '#2e3744',
            labelFontSize: labelSizeForNode(node),
            labelFontFamily: 'Space Grotesk, Inter, sans-serif',
            cursor: 'pointer',
          },
        };
      }),
      edges: publicEdges.map((edge, index) => ({
        id: `edge-${index}`,
        source: edge.source,
        target: edge.target,
        data: {
          relation: edge.relation || '',
        },
        style: {
          stroke: relationColor(edge.relation),
          lineWidth: edge.relation === 'mentions' ? 1.2 : 1.45,
          lineDash: dashedRelations.has(edge.relation) ? [6, 6] : undefined,
          endArrow: false,
        },
      })),
    };

    let graph = null;
    let hoveredNodeId = null;
    let selectedNode = null;
    let activeLegendGroup = null;
    let resizeTimer = null;

    const buildVisibleGraphData = () => {
      if (!activeLegendGroup) return graphData;

      const visibleIds = new Set(
        graphData.nodes
          .filter((node) => node.data?.group === activeLegendGroup)
          .map((node) => node.id)
      );

      if (visibleIds.size === 0) {
        return { nodes: [], edges: [] };
      }

      return {
        nodes: graphData.nodes.filter((node) => visibleIds.has(node.id)),
        edges: graphData.edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)),
      };
    };

    const createGraph = (data) => {
      const { Graph } = window.G6;
      return new Graph({
        container: mount,
        autoFit: 'view',
        animation: false,
        zoomRange: [0.28, 3],
        padding: 32,
        data,
        node: {
          type: 'circle',
          state: {
            focus: {
              stroke: '#191c1f',
              lineWidth: 3,
            },
          },
        },
        edge: {
          type: 'line',
        },
        layout: {
          type: 'd3-force',
          animation: false,
          manyBody: {
            strength: (datum) => {
              const group = datum.data?.group;
              if (group === 'topic') return -360;
              if (group === 'post') return -165;
              return -96;
            },
          },
          link: {
            distance: (datum) => {
              const relation = datum.data?.relation;
              if (relation === 'mentions') return 132;
              if (relation === 'explains' || relation === 'related') return 116;
              return 172;
            },
            strength: (datum) => {
              const relation = datum.data?.relation;
              if (relation === 'explains' || relation === 'related') return 0.26;
              if (relation === 'mentions') return 0.2;
              return 0.18;
            },
          },
          collide: {
            radius: (datum) => ((datum.style?.size || 18) / 2) + 18,
          },
          x: { strength: 0.02 },
          y: { strength: 0.02 },
        },
        behaviors: ['drag-canvas', 'drag-element'],
      });
    };

    const getEventNodeId = (event) => event?.target?.id || event?.item?.id || event?.id || null;

    const clearHover = () => {
      if (!graph || !hoveredNodeId) return;
      graph.setElementState({ [hoveredNodeId]: [] });
      hoveredNodeId = null;
    };

    const setHover = (nodeId) => {
      if (!graph || !nodeId || hoveredNodeId === nodeId) return;
      clearHover();
      graph.setElementState({ [nodeId]: ['focus'] });
      hoveredNodeId = nodeId;
    };

    const hideTooltip = () => {
      selectedNode = null;
      tooltip.classList.add('is-hidden');
    };

    const placeTooltip = (clientX, clientY) => {
      const stageRect = stage.getBoundingClientRect();
      const padding = 18;
      const tooltipRect = tooltip.getBoundingClientRect();

      let left = clientX - stageRect.left + 18;
      let top = clientY - stageRect.top + 18;

      if (left + tooltipRect.width > stageRect.width - padding) {
        left = stageRect.width - tooltipRect.width - padding;
      }
      if (top + tooltipRect.height > stageRect.height - padding) {
        top = stageRect.height - tooltipRect.height - padding;
      }

      left = Math.max(padding, left);
      top = Math.max(padding, top);

      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    };

    const showTooltip = (nodeId, event) => {
      if (!graph) return;

      const nodeData = graph.getNodeData(nodeId);
      const meta = nodeData?.data;
      if (!meta) return;

      selectedNode = meta;
      tooltipKind.textContent = meta.groupLabel || groupLabels[meta.group] || meta.group || '';
      tooltipTitle.textContent = meta.title || meta.name || nodeId;
      tooltipSummary.textContent = meta.summary || fallbackSummary(meta);

      const canOpen = meta.group === 'post' && Boolean(meta.url);
      const openLabel = tooltipLink.dataset.openLabel || 'Open Post';
      const disabledLabel = tooltipLink.dataset.disabledLabel || 'Post Only';
      tooltipLink.hidden = false;
      tooltipLink.disabled = !canOpen;
      tooltipLink.classList.toggle('is-disabled', !canOpen);
      tooltipLink.textContent = canOpen ? openLabel : disabledLabel;

      tooltip.classList.remove('is-hidden');
      placeTooltip(event?.client?.x || event?.viewport?.x || window.innerWidth / 2, event?.client?.y || event?.viewport?.y || 120);
    };

    const fitGraph = () => {
      if (!graph) return;
      graph.resize();
      graph.fitView({ when: 'always' });
    };

    const syncLegendState = () => {
      legendButtons.forEach((button) => {
        const group = button.getAttribute('data-kb-legend-group');
        const isActive = Boolean(activeLegendGroup) && activeLegendGroup === group;
        button.classList.toggle('is-active', isActive);
        button.classList.toggle('is-dimmed', Boolean(activeLegendGroup) && !isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    };

    const bindGraphEvents = () => {
      graph.on('node:pointerenter', (event) => {
        const nodeId = getEventNodeId(event);
        if (nodeId) setHover(nodeId);
      });

      graph.on('node:pointerleave', () => {
        clearHover();
      });

      graph.on('canvas:click', () => {
        clearHover();
        hideTooltip();
      });

      graph.on('node:click', (event) => {
        const nodeId = getEventNodeId(event);
        if (!nodeId) return;
        setHover(nodeId);
        showTooltip(nodeId, event);
      });

      graph.on('node:dragstart', () => {
        hideTooltip();
      });
    };

    const renderGraph = () => {
      hideTooltip();
      clearHover();

      if (graph && typeof graph.destroy === 'function') {
        graph.destroy();
        graph = null;
      }

      mount.textContent = '';
      const nextData = buildVisibleGraphData();
      if (nextData.nodes.length === 0) {
        renderEmptyState(mount, messages.filterEmpty);
        syncLegendState();
        return;
      }

      graph = createGraph(nextData);
      bindGraphEvents();
      graph.render()
        .then(() => {
          fitGraph();
        })
        .catch(() => {
          renderEmptyState(mount, messages.renderError);
        });
      syncLegendState();
    };

    renderGraph();

    const zoomAnimation = { duration: 140 };
    stage.querySelectorAll('[data-kb-zoom]').forEach((button) => {
      button.addEventListener('click', () => {
        if (!graph) return;
        const action = button.getAttribute('data-kb-zoom');
        if (action === 'in') {
          graph.zoomBy(1.15, zoomAnimation, graph.getCanvasCenter());
        } else if (action === 'out') {
          graph.zoomBy(0.87, zoomAnimation, graph.getCanvasCenter());
        } else {
          graph.fitView({ when: 'always' }, zoomAnimation);
        }
      });
    });

    if (tooltipClose) {
      tooltipClose.addEventListener('click', () => {
        hideTooltip();
      });
    }

    tooltipLink.addEventListener('click', () => {
      if (selectedNode?.group === 'post' && selectedNode?.url) {
        window.location.href = selectedNode.url;
      }
    });

    legendButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const group = button.getAttribute('data-kb-legend-group');
        activeLegendGroup = activeLegendGroup === group ? null : group;
        renderGraph();
      });
    });

    stage.addEventListener(
      'wheel',
      (event) => {
        if (!graph) return;
        if (event.target.closest('.kb-graph-actions, .kb-graph-tooltip')) return;
        event.preventDefault();
        const stageRect = stage.getBoundingClientRect();
        const anchor = [event.clientX - stageRect.left, event.clientY - stageRect.top];
        const factor = event.deltaY < 0 ? 1.12 : 0.89;
        graph.zoomBy(factor, zoomAnimation, anchor);
      },
      { passive: false }
    );

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') hideTooltip();
    });

    window.addEventListener('resize', () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        hideTooltip();
        fitGraph();
      }, 120);
    });
  };

  stageRoots.forEach((stage) => {
    initializeStage(stage);
  });
})();
