// Invalid and unset rollout modes fail closed. Configuration never enables itself.
export const autoupdateEnabled=mode=>mode==='meta'||mode==='notify';
