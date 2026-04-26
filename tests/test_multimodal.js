console.log("\n=== TESTE MULTIMODALE PE DATE REALE ===\n");

let passed = 0;
let failed = 0;

function runTest(name, condition, details = "") {
  if (condition) {
    console.log(`Pass: ${name}${details ? " -> " + details : ""}`);
    passed++;
  } else {
    console.log(`Fail: ${name}${details ? " -> " + details : ""}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function getTransitData() {
  return window.transitData;
}

function pickFirstStopWithLines(transitData) {
  for (const [stopId, stopData] of transitData.stops) {
    if (stopData?.lines?.length > 0) {
      return { stopId, stopData };
    }
  }
  return null;
}

function findDirectRouteCandidate(transitData) {
  for (const [routeId, lineData] of transitData.lines) {
    if (!lineData?.directions) continue;

    for (const [direction, dirData] of Object.entries(lineData.directions)) {
      const stopIds = dirData?.stopIds || [];
      if (stopIds.length >= 2) {
        return {
          routeId,
          direction,
          startStopId: stopIds[0],
          endStopId: stopIds[stopIds.length - 1],
          stopCount: stopIds.length,
          route: lineData.route,
        };
      }
    }
  }
  return null;
}

function findLinesBetweenStops(transitData, stopAId, stopBId) {
  const lines = [];

  for (const lineA of transitData.stops.get(stopAId)?.lines || []) {
    const lineData = transitData.lines.get(lineA.route_id);
    if (!lineData) continue;

    const directionStops = lineData.directions[lineA.direction]?.stopIds || [];
    const idxA = directionStops.indexOf(stopAId);
    const idxB = directionStops.indexOf(stopBId);

    if (idxA !== -1 && idxB !== -1 && idxB > idxA) {
      lines.push({
        route_id: lineA.route_id,
        direction: lineA.direction,
        idxA,
        idxB,
        route: lineData.route,
      });
    }
  }

  return lines;
}

function findOneTransferCandidate(transitData, maxChecks = 5000) {
  let checks = 0;

  for (const [startStopId, startStopData] of transitData.stops) {
    for (const startLine of startStopData.lines || []) {
      const lineData1 = transitData.lines.get(startLine.route_id);
      if (!lineData1) continue;

      const directionStops1 =
        lineData1.directions[startLine.direction]?.stopIds || [];

      const startIdx = directionStops1.indexOf(startStopId);
      if (startIdx === -1) continue;

      for (let i = startIdx + 1; i < directionStops1.length; i++) {
        const transferStopId = directionStops1[i];
        const transferStopData = transitData.stops.get(transferStopId);
        if (!transferStopData) continue;

        for (const line2 of transferStopData.lines || []) {
          if (
            line2.route_id === startLine.route_id &&
            line2.direction === startLine.direction
          ) {
            continue;
          }

          const lineData2 = transitData.lines.get(line2.route_id);
          if (!lineData2) continue;

          const directionStops2 =
            lineData2.directions[line2.direction]?.stopIds || [];
          const transferIdx2 = directionStops2.indexOf(transferStopId);
          if (transferIdx2 === -1) continue;

          for (let j = transferIdx2 + 1; j < directionStops2.length; j++) {
            const endStopId = directionStops2[j];

            // evităm cazul trivial: dacă există deja directă între start și end
            const directLines = findLinesBetweenStops(
              transitData,
              startStopId,
              endStopId,
            );
            if (directLines.length > 0) continue;

            return {
              startStopId,
              transferStopId,
              endStopId,
              route1: {
                route_id: startLine.route_id,
                direction: startLine.direction,
              },
              route2: {
                route_id: line2.route_id,
                direction: line2.direction,
              },
            };
          }

          checks++;
          if (checks > maxChecks) return null;
        }
      }
    }
  }

  return null;
}

function removeDuplicateRoutesLikeApp(routes) {
  const uniqueRoutes = [];
  const routeKeys = new Set();

  for (const route of routes) {
    const key = `${route.route1.route_id}_${route.route2.route_id}_${route.startStop.stop_id}_${route.endStop.stop_id}`;
    if (!routeKeys.has(key)) {
      routeKeys.add(key);
      uniqueRoutes.push(route);
    }
  }

  return uniqueRoutes;
}

async function getNextBus(stopId) {
  const response = await fetch(
    `bus_api.php?action=get_next_bus&stop_id=${encodeURIComponent(stopId)}`,
  );
  return await response.json();
}

(async function runMultimodalTests() {
  try {
    const transitData = getTransitData();

    runTest("window.transitData există", !!transitData);

    runTest("transitData.stops este Map", transitData?.stops instanceof Map);

    runTest("transitData.lines este Map", transitData?.lines instanceof Map);

    runTest(
      "Indexul de stații este populat",
      (transitData?.stops?.size || 0) > 0,
      `size=${transitData?.stops?.size || 0}`,
    );

    runTest(
      "Indexul de linii este populat",
      (transitData?.lines?.size || 0) > 0,
      `size=${transitData?.lines?.size || 0}`,
    );

    const firstStop = pickFirstStopWithLines(transitData);
    runTest(
      "Există cel puțin o stație deservită de linii",
      !!firstStop,
      firstStop ? `${firstStop.stopId}` : "",
    );

    if (firstStop) {
      runTest(
        "Stația selectată are cel puțin o linie",
        (firstStop.stopData.lines?.length || 0) > 0,
        `lines=${firstStop.stopData.lines.length}`,
      );
    }

    // Test consistență: liniile din stații există și în indexul de linii
    let invalidLineRefs = 0;
    let checkedRefs = 0;
    for (const [stopId, stopData] of transitData.stops) {
      for (const line of stopData.lines || []) {
        checkedRefs++;
        if (!transitData.lines.has(line.route_id)) {
          invalidLineRefs++;
        }
      }
    }

    runTest(
      "Referințele stop -> line sunt consistente",
      invalidLineRefs === 0,
      `checked=${checkedRefs}, invalid=${invalidLineRefs}`,
    );

    // Test rută directă reală
    const directCandidate = findDirectRouteCandidate(transitData);
    runTest(
      "Există cel puțin o rută directă reală în index",
      !!directCandidate,
      directCandidate
        ? `${directCandidate.routeId} (${directCandidate.startStopId} -> ${directCandidate.endStopId})`
        : "",
    );

    if (directCandidate) {
      const directLines = findLinesBetweenStops(
        transitData,
        directCandidate.startStopId,
        directCandidate.endStopId,
      );

      runTest(
        "Rută directă: există cel puțin o linie validă între start și end",
        directLines.length > 0,
        `count=${directLines.length}`,
      );

      if (directLines.length > 0) {
        const first = directLines[0];
        runTest(
          "Rută directă: ordinea stațiilor este corectă pe traseu",
          first.idxB > first.idxA,
          `idxA=${first.idxA}, idxB=${first.idxB}`,
        );
      }

      // test API live pentru stația de start
      const arrivals = await getNextBus(directCandidate.startStopId);
      runTest(
        "API get_next_bus răspunde valid pentru stația de start",
        arrivals && typeof arrivals.success === "boolean",
      );
    }

    // Test rută cu un schimb real
    const transferCandidate = findOneTransferCandidate(transitData);
    runTest(
      "Există cel puțin o rută cu un schimb în rețea",
      !!transferCandidate,
      transferCandidate
        ? `${transferCandidate.route1.route_id} -> ${transferCandidate.route2.route_id}`
        : "",
    );

    if (transferCandidate) {
      const leg1 = findLinesBetweenStops(
        transitData,
        transferCandidate.startStopId,
        transferCandidate.transferStopId,
      );
      const leg2 = findLinesBetweenStops(
        transitData,
        transferCandidate.transferStopId,
        transferCandidate.endStopId,
      );
      const directWhole = findLinesBetweenStops(
        transitData,
        transferCandidate.startStopId,
        transferCandidate.endStopId,
      );

      runTest(
        "Rută cu schimb: segmentul 1 este valid",
        leg1.length > 0,
        `count=${leg1.length}`,
      );

      runTest(
        "Rută cu schimb: segmentul 2 este valid",
        leg2.length > 0,
        `count=${leg2.length}`,
      );

      runTest(
        "Rută cu schimb: nu există rută directă pe aceeași pereche start-end",
        directWhole.length === 0,
        `directWhole=${directWhole.length}`,
      );
    }

    // Test sortare după totalTime
    const routeMocks = [
      { totalTime: 30, name: "C" },
      { totalTime: 15, name: "A" },
      { totalTime: 22, name: "B" },
    ].sort((a, b) => a.totalTime - b.totalTime);

    runTest(
      "Sortarea după totalTime este corectă",
      routeMocks[0].name === "A" &&
        routeMocks[1].name === "B" &&
        routeMocks[2].name === "C",
    );

    // Test deduplicare exact în stilul aplicației
    const duplicateRoutes = [
      {
        route1: { route_id: "10" },
        route2: { route_id: "20" },
        startStop: { stop_id: "100" },
        endStop: { stop_id: "200" },
      },
      {
        route1: { route_id: "10" },
        route2: { route_id: "20" },
        startStop: { stop_id: "100" },
        endStop: { stop_id: "200" },
      },
      {
        route1: { route_id: "10" },
        route2: { route_id: "21" },
        startStop: { stop_id: "100" },
        endStop: { stop_id: "200" },
      },
    ];

    const unique = removeDuplicateRoutesLikeApp(duplicateRoutes);

    runTest(
      "Deduplicarea în stilul aplicației funcționează",
      unique.length === 2,
      `unique=${unique.length}`,
    );
  } catch (err) {
    console.error("❌ Eroare în testele multimodale:", err);
    failed++;
  }

  console.log(`Trecute: ${passed}`);
  console.log(`Eșuate: ${failed}`);
})();
