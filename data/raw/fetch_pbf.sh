#!/bin/bash
# Downloads the Geofabrik southern India extract and cuts out the Chennai metro area.
# Data (c) OpenStreetMap contributors, ODbL.
set -e
cd "$(dirname "$0")"
curl -sL -m 3000 -o southern.osm.pbf https://download.geofabrik.de/asia/india/southern-zone-latest.osm.pbf
echo "downloaded $(stat -c%s southern.osm.pbf) bytes"
osmium extract -b 80.02,12.78,80.36,13.26 --strategy=complete_ways -O -o chennai.osm.pbf southern.osm.pbf
echo "extracted $(stat -c%s chennai.osm.pbf) bytes"
rm -f southern.osm.pbf
osmium tags-filter -O -o chennai-pois.osm.pbf chennai.osm.pbf nwr/shop nwr/amenity nwr/craft nwr/healthcare nwr/office nwr/leisure=fitness_centre,sports_centre nwr/tourism=hotel,guest_house,hostel nwr/railway=station,halt n/highway=bus_stop n/place
osmium export -O -f geojsonseq --geometry-types=point,polygon,linestring -o pois.geojsonseq chennai-pois.osm.pbf
osmium tags-filter -O -o chennai-roads.osm.pbf chennai.osm.pbf w/highway=motorway,trunk,primary,secondary,tertiary,unclassified,residential,living_street,pedestrian,motorway_link,trunk_link,primary_link,secondary_link,tertiary_link
osmium export -O -f geojsonseq --geometry-types=linestring -o roads.geojsonseq chennai-roads.osm.pbf
osmium tags-filter -O -o chennai-land.osm.pbf chennai.osm.pbf w/natural=water,coastline w/leisure=park w/railway=rail,subway,light_rail w/landuse=residential,commercial,retail,industrial w/waterway=river,canal r/natural=water
osmium export -O -f geojsonseq -o land.geojsonseq chennai-land.osm.pbf
ls -la
echo ALLDONE
