interface HighlightOptions {
  regex: RegExp | string;
  excludes: string[];
  limit: number;
}
interface ClosestMatch extends Array<string> {
  input: string;
  size: number;
  percent: number;
  changes: number;
  index: number;
  endIndex: number;
  length: number;
}
interface NodeParts {
  nodeParts: string;
  indexOfNodeThatMatchStartsIn: number;
}

namespace Highlighter {
  export const clearHighlight = (keys: string[] | string) => {
    let elements: Array<Node>;
    let nodes: Array<ChildNode>;
    let keysArray: Array<string> = Array.prototype.concat(keys);

    for (let j = 0; j < keysArray.length; j++) {
      elements = Array.from(
        document.querySelectorAll(
          `highlight-me.chrome-regeggz-highlight-me.${keysArray[j]}`
        )
      );

      for (let i = 0; i < elements.length; i++) {
        nodes = Array.from(elements[i].childNodes);
        let nodesFragment = document.createDocumentFragment();
        for (let node in nodes) {
          nodesFragment.appendChild(nodes[node]);
        }
        elements[i].parentNode?.replaceChild(nodesFragment, elements[i]);
        elements[i] = nodes[0];
        nodes[0].parentNode?.normalize();
      }
    }
  };

  export const highlight = (
    root: HTMLElement,
    options: HighlightOptions = {
      regex: '',
      excludes: [],
      limit: 1000,
    },
    callback: (match: string, id: number) => HTMLElement
  ) => {
    options.excludes = [
      'script',
      'style',
      'iframe',
      'canvas',
      'noscript',
    ].concat(options.excludes);

    let tw = makeTreeWalker(options.excludes, root);

    let groupedNodes = makeGroupedNodeArray(tw, root);

    let masterStr = '';
    let test: RegExpExecArray | null;
    let test2: RegExpExecArray | null;
    let tag: HTMLElement;
    let newNode: Text;
    let insertedNode: Node | undefined;
    let amountOfSelectedMatches = 0;
    let nodeList: Node[][] = [];
    let groupedNodesLength = groupedNodes.length;

    // loop through all groups of nodes or until we have looped options.limit times
    for (
      let i = 0;
      i < groupedNodesLength && nodeList.length < options.limit;
      i++
    ) {
      // get a string that is formed from a group of nodes
      masterStr = groupedNodes[i].map((elem: any) => elem.data).join('');

      let sameMatchID = 0;

      // determine wether or not the search string
      // is a regular expression or a string
      if (options.regex instanceof RegExp) {
        // loop through the matches in masterStr
        while (
          (test = options.regex.exec(masterStr)) &&
          test[0] !== '' &&
          nodeList.length < options.limit
        ) {
          // store the index of the last match
          let lastRegIndex = options.regex.lastIndex;

          amountOfSelectedMatches++;

          let { nodeParts, indexOfNodeThatMatchStartsIn: j } = getNodeParts(
            test.index,
            groupedNodes[i]
          );

          options.regex.lastIndex = 0;

          // get the string that starts at the found match
          // and ends at the end of the containing nodes text
          let inThisNode = nodeParts.substring(test.index);

          // try to find the whole match in the current node
          test2 = options.regex.exec(groupedNodes[i][j].data);

          // if couldn't find the match in the current node, we know that the match
          // spans across several nodes in this node group so make a custom
          // RegExpExecArray containing all characters from the start of the
          // match in the node to the end of the nodes text
          test2 ||
            (test2 = makeCustomRegExpExecArray(
              inThisNode,
              groupedNodes[i][j].data.length - inThisNode.length,
              groupedNodes[i][j].data
            ));

          let helpArr: string[] = [];

          // push the match or first part of the match to the helpArr
          helpArr.push(test2[0]);

          // create an array for the nodes containing this match in the node list
          nodeList.push([]);

          // loop until the combined length of text in helpArr is
          // greater than or equal to the full match length
          for (let k = 0; helpArr.join('').length < test[0].length; k++) {
            // split the text node at the index of the match in the text node
            // splitText() splits the node such that the left side of the split
            // remains to be the original node and is updated in groupedNodes[i][j]
            // the right side of the node gets returned to newNode
            newNode = groupedNodes[i][j].splitText(
              groupedNodes[i][j].length - helpArr[k].length
            );

            // get the tag to be inserted from the callback
            tag = callback(helpArr[k], sameMatchID);

            // clear the nodes data
            newNode.data = '';

            // insert the tag under newNodes parent, but in between groupedNodes[i][j] and newNode
            insertedNode = newNode.parentNode?.insertBefore(tag, newNode);

            // if the insert was successful
            if (
              insertedNode != null &&
              insertedNode.firstChild instanceof Text
            ) {
              // push the inserted node to the last group in nodeList
              nodeList[nodeList.length - 1].push(insertedNode);

              // if the splitText() call happened on index 0 of the
              // text node in groupedNodes[i][j], replace that node
              // with the inserted node and do not increment j.
              // if the splitText() call happened on an index other than
              // 0, insert the text node into the groupedNodes array after
              // groupedNodes[i][j] and make sure to increment j.
              if (groupedNodes[i][j].data.length === 0) {
                groupedNodes[i][j] = insertedNode.firstChild;
              } else {
                groupedNodes[i].splice(j + 1, 0, insertedNode.firstChild);
                j++;
              }

              // move on to the next node and increment sameMatchID for tag
              j++;
              sameMatchID++;

              // push the text of the next node to helpArr for the continuation of the loop
              helpArr.push(groupedNodes[i][j].data);
            }
          }

          // get the full text of the last node containing the match
          let lastNode = helpArr.pop();

          // if the match occurred in more than one node
          if (helpArr[0] && lastNode != null) {
            // split the node at the beginning to create an empty node and
            // a node containing the full text of the original node
            newNode = groupedNodes[i][j].splitText(0);

            // get the tag and provide, the part of the match that is in this node,
            // from the start or 0 index to the length of the match minus the length
            // of the text of the nodes containing the match, and provide -1 to signify
            // this is the last node containing the match
            tag = callback(
              lastNode.substring(0, test[0].length - helpArr.join('').length),
              -1
            );
            // replace newNode's data with everything that is after the occurrence of the
            // match in this node.
            newNode.data = newNode.data.substring(
              test[0].length - helpArr.join('').length
            );
            // insert the tag under newNodes parent, but in between groupedNodes[i][j] and newNode
            insertedNode = newNode.parentNode?.insertBefore(tag, newNode);

            // if the inserted was successful
            if (
              insertedNode != null &&
              insertedNode.firstChild instanceof Text
            ) {
              // push the inserted node to the last group in nodeList
              nodeList[nodeList.length - 1].push(insertedNode);
              // replace groupedNodes[i][j] with the inserted text node
              groupedNodes[i][j] = insertedNode.firstChild;
              // if newNode has text, make sure to insert it back into groupedNodes[i] after index j
              if (newNode.data.length > 0) {
                groupedNodes[i].splice(j + 1, 0, newNode);
              }
              // increase sameMatchID for the tag
              sameMatchID++;
            }
            // else if the match occurs in only one node
          } else {
            // split the node at the beginning of the match
            newNode = groupedNodes[i][j].splitText(test2.index);

            // create a tag
            tag = callback(test2[0], -1);

            // replace newNode's data with the text after the match in this node
            newNode.data = newNode.data.substring(test2[0].length);

            // insert the tag under newNodes parent, but in between groupedNodes[i][j] and newNode
            insertedNode = newNode.parentNode?.insertBefore(tag, newNode);

            // if the insert was successful
            if (
              insertedNode != null &&
              insertedNode.firstChild instanceof Text
            ) {
              // push the inserted node to the last group in nodeList
              nodeList[nodeList.length - 1].push(insertedNode);

              // if the match occurred at the beginning of the node
              if (groupedNodes[i][j].data === '') {
                // if newNode's text is empty, replace the node at groupedNodes[i][j]
                // with insertedNode's text in groupedNodes
                if (newNode.data === '') {
                  groupedNodes[i].splice(j, 1, insertedNode.firstChild);
                  // if newNode's text is not empty
                } else {
                  // replace replace the node at groupedNodes[i][j] with insertedNode's
                  // text and newNode in that order in groupedNodes
                  groupedNodes[i].splice(
                    j,
                    1,
                    insertedNode.firstChild,
                    newNode
                  );
                }
                // if the match occurred anywhere accept the beginning of the node
              } else {
                // if newNode's text is empty, replace newNode with insertedNode's text in groupedNodes
                if (newNode.data === '') {
                  groupedNodes[i].splice(j + 1, 0, insertedNode.firstChild);
                  // if newNode's text is not empty
                } else {
                  // replace newNode with insertedNode's text and newNode in that order in groupedNodes
                  groupedNodes[i].splice(
                    j + 1,
                    0,
                    insertedNode.firstChild,
                    newNode
                  );
                }
              }
            }
          }
          // reset nodeParts
          nodeParts = '';
          // replace the current regex match index with the last matches index
          options.regex.lastIndex = lastRegIndex;
        }
        options.regex.lastIndex = 0;
      } else {
        // find the closest match in the masterStr
        let match = findClosestMatch(options.regex, masterStr);

        // if the match is within 80% of the test string
        if (match.percent > 80) {
          amountOfSelectedMatches++;

          // create nodeParts array and find the index j signifying the node that the match starts in
          let { nodeParts, indexOfNodeThatMatchStartsIn: j } = getNodeParts(
            match.index,
            groupedNodes[i]
          );

          // find the index at which the match occurs within the first node
          let nodeStartIndex =
            match.index - (nodeParts.length - groupedNodes[i][j].data.length);

          // push a node group array to nodeList
          nodeList.push([]);

          // if the full match is in the current node
          if (nodeStartIndex + match.size <= groupedNodes[i][j].data.length) {
            // split the node at the index where the match occurs
            newNode = groupedNodes[i][j].splitText(nodeStartIndex);
            // create the tag
            tag = callback(match[0], sameMatchID);
            // delete the match from newNode's text while keeping the
            // text after the occurrence of the match
            newNode.data = newNode.data.substring(match.size);
            // insert the tag in between groupedNodes[i][j] and newNode
            insertedNode = newNode.parentNode?.insertBefore(tag, newNode);
            // if the insert was successful
            if (
              insertedNode != null &&
              insertedNode.firstChild instanceof Text
            ) {
              // push the insertedNode to the last group in nodeList
              nodeList[nodeList.length - 1].push(insertedNode);
              // if groupedNodes[i][j] has no text, replace groupedNodes[i][j] with insertedNode's text
              if (groupedNodes[i][j].data.length === 0) {
                groupedNodes[i][j] = insertedNode.firstChild;
              } else {
                // insert insertedNode between groupedNodes[i][j] and newNode in groupedNodes and increment j
                groupedNodes[i].splice(j + 1, 0, insertedNode.firstChild);
                j++;
              }
              // increment j and sameMatchID
              j++;
              sameMatchID++;
            }
            // if the full match occurs across multiple nodes
          } else {
            let helpStr = '';
            // split the node at the index of the match in the node
            newNode = groupedNodes[i][j].splitText(nodeStartIndex);
            // add the newNode's text to the helpStr
            helpStr += newNode.data;
            // create the tag
            tag = callback(newNode.data, sameMatchID);
            // clear newNode's text
            newNode.data = '';
            // insert the tag in between groupedNodes[i][j] and newNode
            insertedNode = newNode.parentNode?.insertBefore(tag, newNode);
            // if the insert was successful
            if (
              insertedNode != null &&
              insertedNode.firstChild instanceof Text
            ) {
              // push the insertedNode to the last group in nodeList
              nodeList[nodeList.length - 1].push(insertedNode);
              // if groupedNodes[i][j] text is empty, replace groupedNodes[i][j] with insertedNode's text
              if (groupedNodes[i][j].data.length === 0) {
                groupedNodes[i][j] = insertedNode.firstChild;
              } else {
                // insert insertedNode after groupedNodes[i][j] and increment j
                groupedNodes[i].splice(j + 1, 0, insertedNode.firstChild);
                j++;
              }
              // increment j and sameMatchID
              j++;
              sameMatchID++;
            }

            // loop through this group of nodes between the first node that the
            // match occurs in and the last node that the match occurs in
            while ((helpStr + groupedNodes[i][j].data).length < match.size) {
              // add the current nodes text to the helpStr
              helpStr += groupedNodes[i][j].data;
              // split the current node at the start of the nodes text
              newNode = groupedNodes[i][j].splitText(0);
              // create the tag
              tag = callback(newNode.data, sameMatchID);
              // clear the newNode's data
              newNode.data = '';
              // insert the tag before the newNode
              insertedNode = newNode.parentNode?.insertBefore(tag, newNode);
              // if the insert was successful
              if (
                insertedNode != null &&
                insertedNode.firstChild instanceof Text
              ) {
                // push the insertedNode to the last group in nodeList
                nodeList[nodeList.length - 1].push(insertedNode);
                // if groupedNodes[i][j] text is empty, replace groupedNodes[i][j] with insertedNode's text
                if (groupedNodes[i][j].data.length === 0) {
                  groupedNodes[i][j] = insertedNode.firstChild;
                } else {
                  // insert insertedNode after groupedNodes[i][j] and increment j
                  groupedNodes[i].splice(j + 1, 0, insertedNode.firstChild);
                  j++;
                }
                // increment j and sameMatchID
                j++;
                sameMatchID++;
              }
            }

            // j is now the index of the last node that the match occurs in, split the node at index 0
            newNode = groupedNodes[i][j].splitText(0);
            // create the tag with just the text containing the match
            tag = callback(
              newNode.data.substring(0, match.size - helpStr.length),
              sameMatchID
            );
            // replace newNode's text with its text that was after the end of the match
            newNode.data = newNode.data.substring(match.size - helpStr.length);
            // insert the node before newNode
            insertedNode = newNode.parentNode?.insertBefore(tag, newNode);
            // if the insert was successful
            if (
              insertedNode != null &&
              insertedNode.firstChild instanceof Text
            ) {
              // push the insertedNode to the last group in the nodeList
              nodeList[nodeList.length - 1].push(insertedNode);
              // if groupedNodes[i][j] text is empty, replace groupedNodes[i][j] with insertedNode's text
              if (groupedNodes[i][j].data.length === 0) {
                groupedNodes[i][j] = insertedNode.firstChild;
              } else {
                // insert insertedNode after groupedNodes[i][j] and don't increment j
                groupedNodes[i].splice(j + 1, 0, insertedNode.firstChild);
              }
              // increment sameMatchID
              sameMatchID++;
            }
          }
        }
      }
    }
    // return the amountOfSelectedMatches and the elements that contain the matches
    return {
      amountOfSelectedMatches,
      elements: nodeList,
    };
  };
}

// highlight methods
const makeTreeWalker = (excludes: string[], root: HTMLElement): TreeWalker => {
  return document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    function (node: Node): number {
      if (!(node instanceof CharacterData)) return NodeFilter.FILTER_ACCEPT;
      if (
        node.data.trim() === '' ||
        isDescendant(excludes, node) ||
        // excludes.indexOf(node.parentNode.tagName.toLowerCase()) > -1 ||
        !node.parentElement?.offsetParent
      ) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  );
};

const isDescendant = (tags: string[], node: Node): boolean => {
  if (node.parentElement == null) return false;
  if (
    node !== document.body &&
    tags.indexOf(node.parentElement.tagName.toLowerCase()) === -1
  ) {
    return isDescendant(tags, node.parentElement);
  }
  return node !== document.body;
};

const trimBadHtmlNodes = (node: Node): void => {
  if (!(node instanceof CharacterData)) return;
  if (node.data.indexOf('\n') !== -1) {
    let before = '';
    let after = '';
    after =
      node.data[node.data.length - 1] === ' ' ||
      node.data[node.data.length - 1] === '\n'
        ? ' '
        : '';
    before = node.data[0] === ' ' || node.data[0] === '\n' ? ' ' : '';
    node.data = before + node.data.trim() + after;
  }
};

const getLastBlockElem = (node: Node, root: HTMLElement) => {
  let elem = node.parentElement;
  while (elem != null && window.getComputedStyle(elem, '').display != 'block') {
    elem = elem.parentElement;
    if (elem === root) return null;
  }
  return elem;
};

const makeGroupedNodeArray = (tw: TreeWalker, root: HTMLElement) => {
  let groupedNodes: Text[][] = [];
  let nodes: Node[] = [];
  while (tw.nextNode()) {
    if (tw.currentNode instanceof Text) {
      trimBadHtmlNodes(tw.currentNode);
      if (groupedNodes.length === 0) {
        groupedNodes.push([]);
        groupedNodes[groupedNodes.length - 1].push(tw.currentNode);
      } else {
        if (
          getLastBlockElem(nodes[nodes.length - 1], root) ===
          getLastBlockElem(tw.currentNode, root)
        ) {
          groupedNodes[groupedNodes.length - 1].push(tw.currentNode);
        } else {
          groupedNodes[groupedNodes.length] = [];
          groupedNodes[groupedNodes.length - 1].push(tw.currentNode);
        }
      }
      nodes.push(tw.currentNode);
    }
  }
  return groupedNodes;
};

const makeCustomRegExpExecArray = (
  inThisNode: string,
  index: number,
  input: string
): RegExpExecArray => {
  let test2: any = [];
  test2[0] = inThisNode;
  test2['index'] = index;
  test2['input'] = input;
  test2['groups'] = undefined;
  return test2;
};

const findClosestMatch = (str1: string, str2: string): ClosestMatch => {
  let mat = lev_distance_matrix(str1, str2);
  let i, j;
  for (
    j = mat[mat.length - 1].length - 2;
    j >= 1 && mat[mat.length - 1][j] < mat[mat.length - 1][j + 1];
    j--
  );
  j += 1;
  let nStr2 = str2.substring(0, j);
  const len1 = str1.length;
  const len2 = nStr2.length;
  let rStr1 = '',
    rStr2 = '';
  for (let k = len1 - 1; k >= 0; k--) rStr1 = rStr1 + str1[k];
  for (let k = len2 - 1; k >= 0; k--) rStr2 = rStr2 + nStr2[k];
  let mat2 = lev_distance_matrix(rStr1, rStr2);
  for (
    i = mat2[mat2.length - 1].length - 2;
    i >= 1 && mat2[mat2.length - 1][i] < mat2[mat2.length - 1][i + 1];
    i--
  );
  i += 1;
  i = rStr2.length - i;
  let changes = lev_distance(str1, str2.substring(i, j));
  let match: any = [];
  match[0] = str2.substring(i, j);
  match['input'] = str1;
  match['size'] = match[0].length;
  match['percent'] = (1 - changes / Math.max(str1.length, match.size)) * 100;
  match['changes'] = changes;
  match['index'] = i;
  match['endIndex'] = j;
  match['length'] = 6;
  return match;
};
/**
 *
 * @param testIndex the index of the found match in the master string
 * @param currentGroupOfNodes the group of nodes who's text forms the master string
 * @returns `NodeParts` interface that stores a nodeParts array or the text from each node
 * in the current group of nodes and the index of the node from which the current match was found in
 */
const getNodeParts = (
  testIndex: number,
  currentGroupOfNodes: Text[]
): NodeParts => {
  let j = 0;
  let nodeParts = '' + currentGroupOfNodes[j].data;

  while (testIndex > nodeParts.length - 1) {
    j++;
    nodeParts = nodeParts + currentGroupOfNodes[j].data;
  }
  return { nodeParts, indexOfNodeThatMatchStartsIn: j };
};

// levenshtein comparison

const lev_distance = (str1: string, str2: string) => {
  let mat = [];
  mat.length = str1.length + 1;
  for (let i = 0; i <= str1.length; i++) {
    mat[i] = [i];
  }
  for (let i = 1; i <= str2.length; i++) {
    mat[0][i] = i;
  }
  for (let i = 1; i < mat.length; i++) {
    for (let j = 1; j < mat[0].length; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        mat[i][j] = mat[i - 1][j - 1];
      } else {
        mat[i][j] =
          Math.min(mat[i - 1][j], mat[i - 1][j - 1], mat[i][j - 1]) + 1;
      }
    }
  }
  return mat[mat.length - 1][mat[mat.length - 1].length - 1];
};

const lev_distance_matrix = (str1: string, str2: string) => {
  let mat = [];
  mat.length = str1.length + 1;
  for (let i = 0; i <= str1.length; i++) {
    mat[i] = [i];
  }
  for (let i = 1; i <= str2.length; i++) {
    mat[0][i] = i;
  }
  for (let i = 1; i < mat.length; i++) {
    for (let j = 1; j < mat[0].length; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        mat[i][j] = mat[i - 1][j - 1];
      } else {
        mat[i][j] =
          Math.min(mat[i - 1][j], mat[i - 1][j - 1], mat[i][j - 1]) + 1;
      }
    }
  }
  return mat;
};
