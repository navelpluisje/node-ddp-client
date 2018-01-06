/* global $Values */

// @flow

function getValues <Obj:Object>(values: Obj) : Array<$Values<Obj>> {
  return Object.values(values);
}

export {
  getValues,
};

export default null;
