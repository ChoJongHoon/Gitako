import { findNode } from './general'

/**
 * This is the stack for generating an array of nodes for rendering
 *
 * when lower layer changes, higher layers would reset
 * when higher layer changes, lower layers would not notice
 *
 *  render stack                 | when will change         | on change callback
 *
 *  ^  changes frequently
 *  |
 *  |4 focus                     | when hover/focus move    | onFocusChange
 *  |                            |                          |   expandedNodes + focusNode -> visibleNodes
 *  |3 expansion                 | when fold/unfold         | onExpansionChange
 *  |                            |                          |   searchedNodes + toggleNode -> expandedNodes
 *  |2 filters                   | when filter(search)      | onSearch
 *  |                            |                          |   treeNodes + searchKey -> searchedNodes
 *  |1 tree: { root <-> nodes }  | when tree init           | treeHelper.parse
 *  |                                                       |   tree data from api -> { root, nodes }
 *  v  stable
 */

function search(
  root: TreeNode,
  match: (node: TreeNode) => boolean,
  onChildMatch: (node: TreeNode) => void,
): TreeNode | null {
  // go traverse no matter root matches or not to make sure find all nodes
  const contents = []

  if (root.type === 'tree' && root.contents) {
    let childMatch = false
    for (const item of root.contents) {
      if (match(item)) {
        childMatch = true
        break
      }
    }

    for (const item of root.contents) {
      const $item = search(item, match, onChildMatch)
      if ($item) {
        if ($item !== item) childMatch = true
        contents.push($item)
      }
    }

    if (childMatch) {
      onChildMatch(root)
    }

    if (contents?.length) {
      return {
        ...root,
        contents,
      }
    }
  }

  if (match(root)) {
    return root
  }
  return null
}

function compressTree(root: TreeNode, prefix: string[] = []): TreeNode {
  if (root.contents) {
    if (root.contents.length === 1) {
      const [singleton] = root.contents
      if (singleton.type === 'tree') {
        return compressTree(singleton, [...prefix, root.name])
      }
    }

    let compressed = false
    const contents = []
    for (const item of root.contents) {
      const $item = compressTree(item)
      if ($item !== item) compressed = true
      contents.push($item)
    }
    if (compressed)
      return {
        ...root,
        name: [...prefix, root.name].join('/'),
        contents,
      }
  }
  return prefix.length
    ? {
        ...root,
        name: [...prefix, root.name].join('/'),
      }
    : root
}

class L1 {
  root: TreeNode

  constructor(root: TreeNode) {
    this.root = root
  }
}

class L2 {
  private l1: L1
  compress: boolean
  root: TreeNode | null = null

  constructor(l1: L1, options: Options) {
    this.l1 = l1
    this.compress = Boolean(options.compress)
  }

  search = (
    match: null | ((node: TreeNode) => boolean),
    onChildMatch: (node: TreeNode) => void,
  ) => {
    const rootNode = match ? search(this.l1.root, match, onChildMatch) : this.l1.root

    this.root =
      rootNode && this.compress
        ? { ...rootNode, contents: rootNode.contents?.map(node => compressTree(node)) }
        : rootNode
  }
}

class L3 {
  private l1: L1
  private l2: L2

  nodes: TreeNode[] = []
  expandedNodes: Set<TreeNode['path']> = new Set()
  depths: Map<TreeNode, number> = new Map()

  constructor(l1: L1, l2: L2) {
    this.l1 = l1
    this.l2 = l2
  }

  toggleExpand = (node: TreeNode, recursive?: boolean) => {
    const expand = !this.expandedNodes.has(node.path)
    if (recursive) {
      const recursiveSetExpand = (node: TreeNode, expand: boolean) => {
        this.barelySetExpand(node, expand)
        node.contents?.forEach($node => recursiveSetExpand($node, expand))
      }
      recursiveSetExpand(node, expand)
      this.generateVisibleNodes()
    } else {
      this.setExpand(node, expand)
    }
  }

  barelySetExpand = (node: TreeNode, expand: boolean) => {
    if (expand && node.contents) {
      // only node with contents is expandable
      this.expandedNodes.add(node.path)
    } else {
      this.expandedNodes.delete(node.path)
    }
  }

  setExpand = (node: TreeNode, expand: boolean) => {
    this.barelySetExpand(node, expand)
    this.generateVisibleNodes()
  }

  expandTo = (path: string, expandAlongTheWay?: boolean) => {
    const rootNode = this.l2.root
    if (expandAlongTheWay && path.includes('/')) {
      this.expandTo(path.slice(0, path.lastIndexOf('/')), true)
    }
    const node = rootNode && findNode(rootNode, path.split('/'), node => this.setExpand(node, true))
    if (node) this.setExpand(node, true)
    return node
  }

  search = (regexp: RegExp | null) => {
    this.expandedNodes.clear()
    this.l2.search(regexp && (node => regexp.test(node.name)), node =>
      this.expandedNodes.add(node.path),
    )
    this.generateVisibleNodes()
  }

  generateVisibleNodes = () => {
    this.depths.clear()
    const nodes: TreeNode[] = []
    if (this.l2.root?.contents) {
      const traverse = (root: TreeNode, depth = 0) => {
        nodes.push(root)
        this.depths.set(root, depth)
        if (this.expandedNodes.has(root.path) && root.type === 'tree' && root.contents?.length) {
          for (const item of root.contents) {
            traverse(item, depth + 1)
          }
        }
      }
      for (const item of this.l2.root.contents) {
        traverse(item)
      }
    }
    this.nodes = nodes
  }
}

export type VisibleNodes = {
  nodes: L3['nodes']
  depths: L3['depths']
  expandedNodes: L3['expandedNodes']
  focusedNode: L4['focusedNode']
}

class L4 {
  private l1: L1
  private l2: L2
  private l3: L3

  focusedNode: TreeNode | null

  constructor(l1: L1, l2: L2, l3: L3) {
    this.l1 = l1
    this.l2 = l2
    this.l3 = l3
    this.focusedNode = null
  }

  focusNode = (node: TreeNode | null) => {
    this.focusedNode = node
  }
}

type Options = {
  compress?: boolean
}

export class VisibleNodesGenerator {
  private l1: L1
  private l2: L2
  private l3: L3
  private l4: L4

  constructor(root: TreeNode, options: Options) {
    this.l1 = new L1(root)
    this.l2 = new L2(this.l1, options)
    this.l3 = new L3(this.l1, this.l2)
    this.l4 = new L4(this.l1, this.l2, this.l3)

    this.search(null)
  }

  search: L3['search'] = regexps => {
      this.l3.search(regexps)
      this.l4.focusNode(null)
    }
  setExpand: L3['setExpand'] = (...args) => this.l3.setExpand(...args)
  toggleExpand: L3['toggleExpand'] = (...args) => this.l3.toggleExpand(...args)
  expandTo: L3['expandTo'] = (...args) => this.l3.expandTo(...args)
  focusNode: L4['focusNode'] = (...args) => this.l4.focusNode(...args)

  get visibleNodes() {
    return {
      nodes: this.l3.nodes,
      depths: this.l3.depths,
      expandedNodes: this.l3.expandedNodes,
      focusedNode: this.l4.focusedNode,
    }
  }
}
