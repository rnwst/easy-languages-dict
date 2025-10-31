export type JSONSerializable =
  string | number | boolean | null | JSONObject | JSONArray;
type JSONObject = { [key: string]: JSONSerializable };
type JSONArray = Array<JSONSerializable>;
