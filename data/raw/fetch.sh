#!/bin/bash
# Downloads raw OpenStreetMap extracts for the Chennai metro area via Overpass.
# Data (c) OpenStreetMap contributors, ODbL.
BBOX="12.78,80.02,13.26,80.36"
UA="kirana-research-script/0.1"
EP="https://overpass-api.de/api/interpreter"
q() { # name, query
  echo "fetching $1"; 
  for i in 1 2 3 4; do
    code=$(curl -s -m 600 -A "$UA" -o "$1.json" -w "%{http_code}" --data-urlencode "data=$2" "$EP")
    if [ "$code" = "200" ] && head -c 200 "$1.json" | grep -q '"version"'; then echo "  ok $(stat -c%s $1.json) bytes"; return 0; fi
    echo "  attempt $i failed ($code), waiting"; sleep 45
  done; return 1
}
q places "[out:json][timeout:120];(node[place~\"^(suburb|neighbourhood|quarter|town|village|locality)$\"]($BBOX););out;"
sleep 5
q pois "[out:json][timeout:300][maxsize:1073741824];(nwr[shop]($BBOX);nwr[amenity]($BBOX);nwr[craft]($BBOX);nwr[healthcare]($BBOX);nwr[office]($BBOX);nwr[leisure~\"^(fitness_centre|sports_centre)$\"]($BBOX);nwr[tourism~\"^(hotel|guest_house|hostel)$\"]($BBOX);nwr[railway~\"^(station|halt)$\"]($BBOX);nwr[station=subway]($BBOX);node[highway=bus_stop]($BBOX););out center tags;"
sleep 10
q roads "[out:json][timeout:600][maxsize:2000000000];way[highway~\"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$\"]($BBOX);out geom qt;"
sleep 10
q landuse "[out:json][timeout:300][maxsize:1073741824];(way[landuse~\"^(residential|commercial|retail|industrial)$\"]($BBOX);way[natural=water]($BBOX);way[leisure=park]($BBOX);way[natural=coastline]($BBOX);way[railway~\"^(rail|subway|light_rail)$\"]($BBOX););out geom qt;"
echo done
