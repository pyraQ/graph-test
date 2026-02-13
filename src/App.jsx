import { useEffect, useMemo } from 'react';
import ELK from 'elkjs/lib/elk.bundled.js';
import ReactFlow, {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlowProvider,
  useEdgesState,
  useNodesState
} from 'reactflow';
import 'reactflow/dist/style.css';

const sampleJson = {
  servers: [
    {
      serverName: 'Order Server',
      serverId: 'S1',
      serverAddress: '10.0.0.1',
      channels: [
        {
          channelName: 'OrderCreatedChannel',
          rxIdentifiers: ['PAYMENT_SERVICE', 'SHIPPING_SERVICE'],
          txIdentifiers: ['ORDER_SERVICE']
        },
        {
          channelName: 'OrderCancelChannel',
          rxIdentifiers: ['REFUND_SERVICE'],
          txIdentifiers: ['ORDER_SERVICE']
        }
      ]
    },
    {
      serverName: 'Payment Server',
      serverId: 'S2',
      serverAddress: '10.0.0.2',
      channels: [
        {
          channelName: 'PaymentCompletedChannel',
          rxIdentifiers: ['ORDER_SERVICE'],
          txIdentifiers: ['PAYMENT_SERVICE']
        }
      ]
    }
  ]
};

const elk = new ELK();

function ChannelNode({ data }) {
  const { channelName, txIdentifiers, rxIdentifiers } = data;

  return (
    <div className="channel-node">
      <Handle type="target" position={Position.Left} className="channel-handle" />
      <div className="channel-title">{channelName}</div>
      <div className="channel-body">
        <div className="channel-column">
          <div className="channel-column-label">TX</div>
          {txIdentifiers.map((id) => (
            <div key={`${channelName}-tx-${id}`} className="chip tx-chip">
              {id}
            </div>
          ))}
        </div>
        <div className="channel-column">
          <div className="channel-column-label">RX</div>
          {rxIdentifiers.map((id) => (
            <div key={`${channelName}-rx-${id}`} className="chip rx-chip">
              {id}
            </div>
          ))}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="channel-handle" />
    </div>
  );
}

function ServerHeaderNode({ data }) {
  return (
    <div className="server-header-node">
      <div className="server-title">{data.serverName}</div>
      <div className="server-subtitle">
        {data.serverId} · {data.serverAddress}
      </div>
    </div>
  );
}

function IdentifierNode({ data }) {
  return (
    <div className="identifier-node">
      <Handle type="target" position={Position.Left} />
      <div>{data.label}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export function jsonToGraph(json) {
  const nodes = [];
  const edges = [];
  const identifierSet = new Set();

  json.servers.forEach((server) => {
    const serverGroupId = `server-group-${server.serverId}`;

    nodes.push({
      id: serverGroupId,
      type: 'group',
      draggable: true,
      position: { x: 0, y: 0 },
      style: {
        width: 380,
        height: 120 + server.channels.length * 136,
        border: '2px solid #4f46e5',
        borderRadius: 12,
        background: 'rgba(79, 70, 229, 0.12)'
      }
    });

    nodes.push({
      id: `server-header-${server.serverId}`,
      type: 'serverHeader',
      parentNode: serverGroupId,
      extent: 'parent',
      draggable: false,
      selectable: false,
      position: { x: 12, y: 10 },
      data: {
        serverName: server.serverName,
        serverId: server.serverId,
        serverAddress: server.serverAddress
      },
      style: { width: 350 }
    });

    server.channels.forEach((channel, channelIndex) => {
      const channelNodeId = `channel-${server.serverId}-${channel.channelName}`;
      nodes.push({
        id: channelNodeId,
        type: 'channelNode',
        parentNode: serverGroupId,
        extent: 'parent',
        draggable: true,
        position: {
          x: 35,
          y: 70 + channelIndex * 132
        },
        data: {
          channelName: channel.channelName,
          txIdentifiers: channel.txIdentifiers,
          rxIdentifiers: channel.rxIdentifiers
        },
        style: {
          width: 310
        }
      });

      channel.txIdentifiers.forEach((identifier) => {
        identifierSet.add(identifier);
        edges.push({
          id: `edge-tx-${identifier}-${channelNodeId}`,
          source: `identifier-${identifier}`,
          target: channelNodeId,
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed },
          label: 'TX'
        });
      });

      channel.rxIdentifiers.forEach((identifier) => {
        identifierSet.add(identifier);
        edges.push({
          id: `edge-rx-${channelNodeId}-${identifier}`,
          source: channelNodeId,
          target: `identifier-${identifier}`,
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed },
          label: 'RX'
        });
      });
    });
  });

  [...identifierSet].forEach((identifier) => {
    nodes.push({
      id: `identifier-${identifier}`,
      type: 'identifierNode',
      data: { label: identifier },
      position: { x: 0, y: 0 },
      style: { width: 190 }
    });
  });

  return { nodes, edges };
}

async function applyElkLayout(nodes, edges) {
  const topLevelNodes = nodes.filter((node) => !node.parentNode);
  const topLevelNodeIds = new Set(topLevelNodes.map((node) => node.id));

  const root = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '45',
      'elk.layered.spacing.nodeNodeBetweenLayers': '90'
    },
    children: topLevelNodes.map((node) => ({
      id: node.id,
      width: node.style?.width ?? 240,
      height: node.style?.height ?? 80
    })),
    edges: edges
      .filter((edge) => topLevelNodeIds.has(edge.source) && topLevelNodeIds.has(edge.target))
      .map((edge) => ({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target]
      }))
  };

  const layout = await elk.layout(root);

  const topLevelPositionMap = new Map(
    (layout.children ?? []).map((item) => [item.id, { x: item.x ?? 0, y: item.y ?? 0 }])
  );

  return nodes.map((node) => {
    if (node.parentNode) {
      return node;
    }

    const pos = topLevelPositionMap.get(node.id) ?? { x: 0, y: 0 };
    return {
      ...node,
      position: pos
    };
  });
}

function FlowCanvas() {
  const initialGraph = useMemo(() => jsonToGraph(sampleJson), []);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialGraph.edges);

  useEffect(() => {
    const run = async () => {
      try {
        const layoutedNodes = await applyElkLayout(initialGraph.nodes, initialGraph.edges);
        setNodes(layoutedNodes);
        setEdges(initialGraph.edges);
      } catch (error) {
        console.error('ELK layout failed; rendering fallback positions.', error);
        setNodes(initialGraph.nodes);
        setEdges(initialGraph.edges);
      }
    };

    run();
  }, [initialGraph, setEdges, setNodes]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={{
        channelNode: ChannelNode,
        serverHeader: ServerHeaderNode,
        identifierNode: IdentifierNode
      }}
      fitView
      minZoom={0.2}
      maxZoom={1.8}
      defaultEdgeOptions={{ animated: true }}
    >
      <Background />
      <Controls />
    </ReactFlow>
  );
}

export default function App() {
  return (
    <div className="app-shell">
      <header>
        <h1>Server/Channel/Identifier Graph</h1>
      </header>
      <main className="flow-wrapper">
        <ReactFlowProvider>
          <FlowCanvas />
        </ReactFlowProvider>
      </main>
    </div>
  );
}
