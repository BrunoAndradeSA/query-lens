const NodeType = {
  PACKAGE: 'PACKAGE',
  PROCEDURE: 'PROCEDURE',
  FUNCTION: 'FUNCTION',
  CONSTANT: 'CONSTANT',
  GLOBAL_VARIABLE: 'GLOBAL_VARIABLE'
};

const EdgeType = {
  DECLARES: 'DECLARES',
  CALLS: 'CALLS',
  CONTAINS: 'CONTAINS'
};

const VISIBILITY = {
  PUBLIC: 'PUBLIC',
  PRIVATE: 'PRIVATE'
};

export function analyzePackage(parsed) {
  if (!parsed || parsed.type !== 'package') {
    return { nodes: [], edges: [], errors: parsed?.errors || [{ message: 'Invalid package' }] };
  }

  const nodes = [];
  const edges = [];
  const errors = parsed.errors || [];

  const packageName = parsed.name;

  const pkgId = `pkg:${packageName}`;
  const pkgNode = {
    id: pkgId,
    name: packageName,
    type: NodeType.PACKAGE,
    visibility: null,
    _constants: [],
    _globals: []
  };
  nodes.push(pkgNode);

  if (parsed.spec) {
    for (const proc of parsed.spec.procedures) {
      const procId = `proc:${packageName}.${proc.name}`;
      nodes.push({
        id: procId,
        name: proc.name,
        type: NodeType.PROCEDURE,
        visibility: VISIBILITY.PUBLIC,
        params: proc.params
      });
      edges.push({
        source: pkgId,
        target: procId,
        type: EdgeType.DECLARES
      });
    }

    for (const func of parsed.spec.functions) {
      const funcId = `func:${packageName}.${func.name}`;
      nodes.push({
        id: funcId,
        name: func.name,
        type: NodeType.FUNCTION,
        visibility: VISIBILITY.PUBLIC,
        params: func.params,
        returnType: func.returnType
      });
      edges.push({
        source: pkgId,
        target: funcId,
        type: EdgeType.DECLARES
      });
    }

    for (const constDecl of parsed.spec.constants) {
      const constId = `const:${packageName}.${constDecl.name}`;
      pkgNode._constants.push({ name: constDecl.name, dataType: constDecl.dataType, id: constId });
      nodes.push({
        id: constId,
        name: constDecl.name,
        type: NodeType.CONSTANT,
        visibility: null,
        dataType: constDecl.dataType
      });
      edges.push({
        source: pkgId,
        target: constId,
        type: EdgeType.DECLARES
      });
    }

    for (const varDecl of parsed.spec.globalVariables) {
      const varId = `var:${packageName}.${varDecl.name}`;
      pkgNode._globals.push({ name: varDecl.name, dataType: varDecl.dataType, id: varId });
      nodes.push({
        id: varId,
        name: varDecl.name,
        type: NodeType.GLOBAL_VARIABLE,
        visibility: null,
        dataType: varDecl.dataType
      });
      edges.push({
        source: pkgId,
        target: varId,
        type: EdgeType.DECLARES
      });
    }
  }

  if (parsed.body) {
    const allPrivate = [
      ...parsed.body.privateProcedures.map(p => ({ ...p, type: NodeType.PROCEDURE })),
      ...parsed.body.privateFunctions.map(f => ({ ...f, type: NodeType.FUNCTION }))
    ];

    for (const priv of allPrivate) {
      const privId = `${priv.type === NodeType.PROCEDURE ? 'proc' : 'func'}:${packageName}.${priv.name}`;

      const existingNode = nodes.find(n => n.id === privId);
      if (!existingNode) {
        nodes.push({
          id: privId,
          name: priv.name,
          type: priv.type,
          visibility: VISIBILITY.PRIVATE,
          params: priv.params,
          returnType: priv.returnType
        });
        edges.push({
          source: pkgId,
          target: privId,
          type: EdgeType.DECLARES
        });
      } else {
        existingNode.visibility = VISIBILITY.PUBLIC;
      }

      if (priv.calls && priv.calls.length > 0) {
        for (const call of priv.calls) {
          const targetId = resolveCallTarget(call.name, packageName, nodes);
          if (targetId) {
            edges.push({
              source: privId,
              target: targetId,
              type: EdgeType.CALLS
            });
          }
        }
      }
    }

    for (const proc of parsed.body.procedures) {
      if (proc.calls && proc.calls.length > 0) {
        const procId = `proc:${packageName}.${proc.name}`;
        for (const call of proc.calls) {
          const targetId = resolveCallTarget(call.name, packageName, nodes);
          if (targetId) {
            edges.push({
              source: procId,
              target: targetId,
              type: EdgeType.CALLS
            });
          }
        }
      }
    }

    for (const func of parsed.body.functions) {
      if (func.calls && func.calls.length > 0) {
        const funcId = `func:${packageName}.${func.name}`;
        for (const call of func.calls) {
          const targetId = resolveCallTarget(call.name, packageName, nodes);
          if (targetId) {
            edges.push({
              source: funcId,
              target: targetId,
              type: EdgeType.CALLS
            });
          }
        }
      }
    }
  }

  return { nodes, edges, errors };
}

function resolveCallTarget(callName, packageName, nodes) {
  if (!callName) return null;
  const upper = callName.toUpperCase();

  const procId = `proc:${packageName}.${callName}`;
  const funcId = `func:${packageName}.${callName}`;

  const found = nodes.find(n => n.id.toUpperCase() === procId.toUpperCase() || n.id.toUpperCase() === funcId.toUpperCase());
  if (found) return found.id;

  if (upper === packageName.toUpperCase()) {
    const pkgNode = nodes.find(n => n.type === NodeType.PACKAGE);
    return pkgNode ? pkgNode.id : null;
  }

  return null;
}

export { NodeType, EdgeType, VISIBILITY };
