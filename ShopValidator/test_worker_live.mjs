import assert from "node:assert/strict";
import { getMapContext } from "./worker.mjs";

const key = process.env.TENCENT_MAP_KEY;
if (!key) {
  throw new Error("请通过 TENCENT_MAP_KEY 环境变量提供腾讯位置服务 WebService Key");
}

const response = await getMapContext(
  new URL("https://local.test/api/map/context?lat=31.2304&lng=121.4737&category=咖啡"),
  { TENCENT_MAP_KEY: key }
);
const payload = await response.json();

assert.equal(response.status, 200, payload.message || "腾讯地图联调失败");
assert.equal(payload.context?.source, "腾讯位置服务");
assert.ok(payload.context?.location?.address, "逆地址解析没有返回地址");
assert.ok(Number.isFinite(payload.context?.nearby?.count), "周边搜索没有返回数量");

console.log(JSON.stringify({
  status: "ok",
  source: payload.context.source,
  address: payload.context.location.address,
  district: payload.context.location.district,
  nearbyCount: payload.context.nearby.count,
  topPlaces: payload.context.nearby.places.slice(0, 3).map((item) => item.title)
}, null, 2));
