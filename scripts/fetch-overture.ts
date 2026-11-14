// Pulls Overture Maps "places" for the Chennai metro bounding box into a local
// Parquet file. Overture Maps Foundation, CDLA-Permissive-2.0 / Apache-2.0 sources.
// Run with Node or Bun: bun run scripts/fetch-overture.ts
import { DuckDBInstance } from "@duckdb/node-api";
const RELEASE = process.env.OVERTURE_RELEASE || "2026-10-21.0";
const out = new URL("../data/raw/overture_places.parquet", import.meta.url).pathname;
const db = await DuckDBInstance.create(":memory:");
const con = await db.connect();
await con.run("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';");
console.log("querying Overture", RELEASE);
await con.run(`COPY (
  SELECT id, names.primary AS name, basic_category AS basic, taxonomy.primary AS category,
         array_to_string(taxonomy.hierarchy, '>') AS hierarchy, operating_status AS status, confidence,
         addresses[1].freeform AS address, addresses[1].locality AS locality, addresses[1].postcode AS postcode,
         brand.names.primary AS brand, sources[1].dataset AS source,
         bbox.xmin AS lon, bbox.ymin AS lat
  FROM read_parquet('s3://overturemaps-us-west-2/release/${RELEASE}/theme=places/type=place/*', hive_partitioning=1)
  WHERE bbox.xmin BETWEEN 80.02 AND 80.36 AND bbox.ymin BETWEEN 12.78 AND 13.26
) TO '${out}' (FORMAT PARQUET)`);
const r = await con.runAndReadAll(`SELECT count(*) AS n, count(DISTINCT category) AS cats, round(avg(confidence),2) AS conf FROM '${out}'`);
console.log(r.getRowObjects());
const top = await con.runAndReadAll(`SELECT category, count(*) AS n FROM '${out}' GROUP BY 1 ORDER BY 2 DESC LIMIT 60`);
console.log(top.getRowObjects().map((x: any) => `${x.category}:${x.n}`).join(", "));
