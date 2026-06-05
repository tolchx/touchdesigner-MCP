# REFERENCE ONLY - canonical TypeScript version is touchdesigner/mcp/src/layoutEngine.ts
"""
Layout Engine for TouchDesigner MCP
Anti-collision, left-to-right, top-to-bottom node positioning.
"""
from dataclasses import dataclass
from typing import List, Tuple, Optional
import math


@dataclass
class NodeBounds:
    """Axis-aligned bounding box for a node."""
    x: float
    y: float
    width: float = 130.0
    height: float = 90.0
    
    @property
    def min_x(self) -> float:
        return self.x
    
    @property
    def max_x(self) -> float:
        return self.x + self.width
    
    @property
    def min_y(self) -> float:
        return self.y
    
    @property
    def max_y(self) -> float:
        return self.y + self.height
    
    def overlaps(self, other: 'NodeBounds') -> bool:
        """Check if this bounds overlaps with another."""
        return (self.min_x < other.max_x and
                self.max_x > other.min_x and
                self.min_y < other.max_y and
                self.max_y > other.min_y)


@dataclass
class LayoutConfig:
    """Configuration for layout algorithm."""
    horizontal_spacing: float = 300.0
    vertical_spacing: float = 250.0
    node_width: float = 130.0
    node_height: float = 90.0
    start_x: float = 0.0
    start_y: float = 0.0
    padding: float = 20.0
    
    # Color coding RGB values
    colors = {
        'source': (0.2, 0.3, 0.6),      # Blue
        'processing': (0.2, 0.5, 0.3),   # Green
        'output': (0.7, 0.4, 0.1),       # Orange
        'control': (0.4, 0.2, 0.5),      # Purple
        'debug': (0.7, 0.2, 0.2),        # Red
    }


class LayoutEngine:
    """
    Anti-collision layout engine for TouchDesigner nodes.
    
    Ensures:
    - Left-to-right flow (increasing X)
    - Top-to-bottom for parallel chains (increasing Y)
    - No overlapping nodes (AABB intersection test)
    - Consistent spacing between nodes
    """
    
    def __init__(self, config: Optional[LayoutConfig] = None):
        self.config = config or LayoutConfig()
        self.placed_nodes: List[NodeBounds] = []
    
    def get_color_for_role(self, role: str) -> Tuple[float, float, float]:
        """Get RGB color for a node role."""
        return self.config.colors.get(role, (0.5, 0.5, 0.5))
    
    def check_collision(self, new_bounds: NodeBounds) -> bool:
        """Check if new_bounds overlaps with any placed node."""
        for placed in self.placed_nodes:
            if new_bounds.overlaps(placed):
                return True
        return False
    
    def find_safe_position(self, chain: int, index: int) -> Tuple[float, float]:
        """
        Find a position that avoids all existing nodes.
        
        Algorithm:
        1. Calculate ideal position based on chain and index
        2. Check for collision with all placed nodes
        3. If collision, shift right by horizontal_spacing until clear
        """
        x = self.config.start_x + (index * self.config.horizontal_spacing)
        y = self.config.start_y + (chain * self.config.vertical_spacing)
        
        bounds = NodeBounds(x, y, self.config.node_width, self.config.node_height)
        
        max_attempts = 20
        attempt = 0
        
        while self.check_collision(bounds) and attempt < max_attempts:
            x += self.config.horizontal_spacing
            bounds = NodeBounds(x, y, self.config.node_width, self.config.node_height)
            attempt += 1
        
        if attempt >= max_attempts:
            # Fallback: place below all existing nodes
            max_y = max(n.max_y for n in self.placed_nodes) if self.placed_nodes else 0
            y = max_y + self.config.vertical_spacing
            bounds = NodeBounds(x, y, self.config.node_width, self.config.node_height)
        
        return (x, y)
    
    def place_node(self, chain: int, index: int, name: str = "") -> Tuple[float, float]:
        """
        Place a node and record its bounds.
        Returns the safe position (x, y).
        """
        x, y = self.find_safe_position(chain, index)
        bounds = NodeBounds(x, y, self.config.node_width, self.config.node_height)
        self.placed_nodes.append(bounds)
        return (x, y)
    
    def plan_linear_chain(self, nodes: List[str], chain: int = 0) -> List[Tuple[str, float, float]]:
        """
        Plan a linear chain of nodes (left-to-right).
        Returns list of (name, x, y) tuples.
        """
        result = []
        for i, name in enumerate(nodes):
            x, y = self.place_node(chain, i, name)
            result.append((name, x, y))
        return result
    
    def plan_parallel_chains(self, chains: List[List[str]]) -> List[Tuple[str, float, float]]:
        """
        Plan multiple parallel chains.
        Each chain gets its own Y offset.
        Returns list of (name, x, y) tuples.
        """
        result = []
        for chain_idx, chain_nodes in enumerate(chains):
            for node_idx, name in enumerate(chain_nodes):
                x, y = self.place_node(chain_idx, node_idx, name)
                result.append((name, x, y))
        return result
    
    def plan_with_merge(self, chains: List[List[str]], merge_node: str) -> List[Tuple[str, float, float]]:
        """
        Plan parallel chains that merge into a single output.
        The merge node is placed after the longest chain.
        """
        result = self.plan_parallel_chains(chains)
        
        # Find the rightmost position across all chains
        max_x = max(pos[1] for pos in result) if result else 0
        
        # Place merge node to the right of all chains
        merge_x = max_x + self.config.horizontal_spacing
        merge_y = self.config.start_y + (len(chains) // 2) * self.config.vertical_spacing
        
        bounds = NodeBounds(merge_x, merge_y, self.config.node_width, self.config.node_height)
        while self.check_collision(bounds):
            merge_x += self.config.horizontal_spacing
            bounds = NodeBounds(merge_x, merge_y, self.config.node_width, self.config.node_height)
        
        self.placed_nodes.append(bounds)
        result.append((merge_node, merge_x, merge_y))
        
        return result
    
    def generate_mcp_commands(self, nodes: List[Tuple[str, float, float]], 
                              container: str = "/project_root") -> List[str]:
        """
        Generate MCP tool commands for placing nodes.
        Returns list of td_create_operator command strings.
        """
        commands = []
        for name, x, y in nodes:
            cmd = (
                f'td_create_operator(type: "{name}", '
                f'name: "{name}", '
                f'path: "{container}", '
                f'position_x: {x}, '
                f'position_y: {y})'
            )
            commands.append(cmd)
        return commands
    
    def reset(self):
        """Reset the layout engine for a new project."""
        self.placed_nodes = []


# Example usage
if __name__ == '__main__':
    engine = LayoutEngine()
    
    # Plan a particle system
    nodes = engine.plan_linear_chain([
        "spherePOP", "noisePOP", "particlePOP", "renderPOP", "nullTOP"
    ])
    
    print("Particle System Layout:")
    for name, x, y in nodes:
        print(f"  {name}: ({x}, {y})")
    
    # Plan parallel chains
    engine.reset()
    parallel = engine.plan_parallel_chains([
        ["moviefileinTOP", "toptoPOP", "noisePOP"],
        ["audioCHOP", "mathCHOP", "choptoPOP"],
    ])
    
    print("\nParallel Chains Layout:")
    for name, x, y in parallel:
        print(f"  {name}: ({x}, {y})")
