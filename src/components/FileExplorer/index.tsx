import { Label, Text } from '@primer/react'
import { LoadingIndicator } from 'components/LoadingIndicator'
import { SearchBar } from 'components/SearchBar'
import { platform } from 'platforms'
import * as React from 'react'
import { run } from 'utils/general'
import { useLoadedContext } from 'utils/hooks/useLoadedContext'
import { useOnLocationChange } from 'utils/hooks/useOnLocationChange'
import { useOnPJAXDone } from 'utils/hooks/usePJAX'
import { VisibleNodes } from 'utils/VisibleNodesGenerator'
import { SideBarStateContext } from '../../containers/SideBarState'
import { SizeObserver } from '../SizeObserver'
import { useFocusFileExplorerOnFirstRender } from './hooks/useFocusFileExplorerOnFirstRender'
import { useGetCurrentPath } from './hooks/useGetCurrentPath'
import { useHandleKeyDown } from './hooks/useHandleKeyDown'
import { useNodeRenderContext } from './hooks/useNodeRenderContext'
import {
  NodeRenderer,
  useNodeRenderers,
  useRenderFileCommentAmounts,
  useRenderFileStatus,
  useRenderFindInFolderButton,
  useRenderGoToButton
} from './hooks/useNodeRenderers'
import { useHandleNodeClick } from './hooks/useOnNodeClick'
import { useOnSearch } from './hooks/useOnSearch'
import { useVisibleNodesGeneratorMethods } from './hooks/useOnVisibleNodesGeneratorReady'
import { useRenderLabelText } from './hooks/useRenderLabelText'
import { useVisibleNodesGenerator } from './hooks/useVisibleNodesGenerator'
import { ListView } from './ListView'
import { useHandleNodeFocus } from './useHandleNodeFocus'
import { useVisibleNodes } from './useVisibleNodes'

export type NodeRendererContext = {
  onNodeClick: (event: React.MouseEvent<HTMLElement, MouseEvent>, node: TreeNode) => void
  onNodeFocus: (event: React.FocusEvent<HTMLElement, Element>, node: TreeNode) => void
  renderLabelText: NodeRenderer
  renderActions: NodeRenderer | undefined
  visibleNodes: VisibleNodes
}

type Props = {
  metaData: MetaData
}

export function FileExplorer({ metaData }: Props) {
  const visibleNodesGenerator = useVisibleNodesGenerator(metaData)
  const visibleNodes = useVisibleNodes(visibleNodesGenerator)

  const [searchKey, updateSearchKey] = React.useState('')
  const searched = !!searchKey
  const onSearch = useOnSearch(updateSearchKey, visibleNodesGenerator)

  const getCurrentPath = useGetCurrentPath(metaData)
  const methods = useVisibleNodesGeneratorMethods(
    visibleNodesGenerator,
    getCurrentPath,
    updateSearchKey,
  )
  const { expandTo, goTo, focusNode } = methods
  const handleNodeClick = useHandleNodeClick(methods)
  const handleNodeFocus = useHandleNodeFocus(methods)
  const handleKeyDown = useHandleKeyDown(visibleNodes, methods, searched)
  const handleFocusSearchBar = () => focusNode(null)

  const renderActions = useNodeRenderers([
    useRenderGoToButton(searched, goTo),
    useRenderFindInFolderButton(onSearch),
    useRenderFileCommentAmounts(),
    useRenderFileStatus(),
  ])
  const renderLabelText = useRenderLabelText(searchKey)

  const nodeRendererContext = useNodeRenderContext(
    visibleNodes,
    handleNodeClick,
    handleNodeFocus,
    renderActions,
    renderLabelText,
  )

  const state = useLoadedContext(SideBarStateContext).value
  useFocusFileExplorerOnFirstRender()

  const goToCurrentItem = React.useCallback(() => {
    const targetPath = platform.getCurrentPath(metaData.branchName)
    if (targetPath) expandTo(targetPath)
  }, [metaData.branchName, expandTo])

  useOnLocationChange(goToCurrentItem)
  useOnPJAXDone(goToCurrentItem)

  return (
    <div className={`file-explorer`} tabIndex={-1} onKeyDown={handleKeyDown}>
      {run(() => {
        switch (state) {
          case 'tree-loading':
            return <LoadingIndicator text={'Fetching File List...'} />
          case 'tree-rendering':
            return <LoadingIndicator text={'Rendering File List...'} />
          case 'tree-rendered':
            return (
              visibleNodes &&
              nodeRendererContext && (
                <>
                  {visibleNodesGenerator?.defer && (
                    <div className={'status'}>
                      <Label
                        title="This repository is large. Gitako has switched to Lazy Mode to improve performance. Folders will be loaded on demand."
                        className={'lazy-mode'}
                        variant="attention"
                      >
                        Lazy Mode is ON
                      </Label>
                    </div>
                  )}
                  <SearchBar value={searchKey} onSearch={onSearch} onFocus={handleFocusSearchBar} />
                  {searched && visibleNodes.nodes.length === 0 && (
                    <>
                      <Text marginTop={6} textAlign="center" color="text.gray">
                        No results found.
                      </Text>
                      {visibleNodesGenerator?.defer && (
                        <Text textAlign="center" color="gray.4" fontSize="12px">
                          Search results are limited to loaded folders in Lazy Mode.
                        </Text>
                      )}
                    </>
                  )}
                  {visibleNodes.nodes.length > 0 && (
                    <SizeObserver<HTMLDivElement>>
                      {({ width = 0, height = 0 }, ref) => (
                        <div className={'files'} ref={ref}>
                          <ListView
                            height={height}
                            width={width}
                            nodeRendererContext={nodeRendererContext}
                          />
                        </div>
                      )}
                    </SizeObserver>
                  )}
                </>
              )
            )
        }
      })}
    </div>
  )
}
