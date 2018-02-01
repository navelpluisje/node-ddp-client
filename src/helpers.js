/* global $Values, $Keys */

// @flow

function getValues <Obj:Object>(values: Obj) : Array<$Values<Obj>> {
  return Object.values(values);
}

function getEntries <Obj:Object>(values: Obj) : Array<[$Keys<Obj>, $Values<Obj>]> {
  return Object.entries(values);
}

export {
  getValues,
  getEntries,
};

export default null;
