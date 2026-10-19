/*
 * Small, dependency-free geometry helpers for the local fidelity demo.
 * They intentionally inspect only the supplied source ImageData.  The output
 * is contour data / SVG path commands; this module never creates a raster
 * payload or makes a network request.
 */
(function () {
  'use strict';

  var EPSILON = 1e-6;

  function alphaAt(imageData, x, y) {
    if (x < 0 || y < 0 || x >= imageData.width || y >= imageData.height) return 0;
    return imageData.data[(y * imageData.width + x) * 4 + 3] / 255;
  }

  function pointKey(point) {
    return Math.round(point.x * 10000) + ':' + Math.round(point.y * 10000);
  }

  function interpolate(first, second, firstValue, secondValue, threshold) {
    var denominator = secondValue - firstValue;
    var amount = Math.abs(denominator) < EPSILON ? .5 : (threshold - firstValue) / denominator;
    amount = Math.max(0, Math.min(1, amount));
    return {
      x: first.x + (second.x - first.x) * amount,
      y: first.y + (second.y - first.y) * amount
    };
  }

  function pairsForCase(caseIndex, centerInside) {
    // Edges are top, right, bottom, left.  Ambiguous saddle cases are resolved
    // using the bilinear cell centre, preventing arbitrary diagonal bridges.
    var table = {
      0: [], 1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]],
      4: [[1, 2]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]],
      9: [[0, 2]], 11: [[1, 2]], 12: [[1, 3]], 13: [[0, 1]],
      14: [[3, 0]], 15: []
    };
    if (caseIndex === 5) return centerInside ? [[0, 1], [2, 3]] : [[3, 0], [1, 2]];
    if (caseIndex === 10) return centerInside ? [[3, 0], [1, 2]] : [[0, 1], [2, 3]];
    return table[caseIndex] || [];
  }

  function marchingSegments(imageData, threshold) {
    var segments = [];
    for (var y = -1; y < imageData.height; y += 1) {
      for (var x = -1; x < imageData.width; x += 1) {
        var tl = alphaAt(imageData, x, y);
        var tr = alphaAt(imageData, x + 1, y);
        var br = alphaAt(imageData, x + 1, y + 1);
        var bl = alphaAt(imageData, x, y + 1);
        var caseIndex = (tl >= threshold ? 1 : 0) | (tr >= threshold ? 2 : 0) | (br >= threshold ? 4 : 0) | (bl >= threshold ? 8 : 0);
        if (caseIndex === 0 || caseIndex === 15) continue;
        var corners = [
          { x: x + .5, y: y + .5 }, { x: x + 1.5, y: y + .5 },
          { x: x + 1.5, y: y + 1.5 }, { x: x + .5, y: y + 1.5 }
        ];
        var values = [tl, tr, br, bl];
        var edges = [
          interpolate(corners[0], corners[1], values[0], values[1], threshold),
          interpolate(corners[1], corners[2], values[1], values[2], threshold),
          interpolate(corners[2], corners[3], values[2], values[3], threshold),
          interpolate(corners[3], corners[0], values[3], values[0], threshold)
        ];
        var centerInside = (tl + tr + br + bl) / 4 >= threshold;
        pairsForCase(caseIndex, centerInside).forEach(function (pair) {
          segments.push({ a: edges[pair[0]], b: edges[pair[1]] });
        });
      }
    }
    return segments;
  }

  function segmentsToLoops(segments) {
    var adjacency = new Map();
    segments.forEach(function (segment, id) {
      segment.aKey = pointKey(segment.a);
      segment.bKey = pointKey(segment.b);
      if (!adjacency.has(segment.aKey)) adjacency.set(segment.aKey, []);
      if (!adjacency.has(segment.bKey)) adjacency.set(segment.bKey, []);
      adjacency.get(segment.aKey).push({ id: id, otherKey: segment.bKey, other: segment.b });
      adjacency.get(segment.bKey).push({ id: id, otherKey: segment.aKey, other: segment.a });
    });
    var used = new Uint8Array(segments.length);
    var loops = [];
    segments.forEach(function (segment, startId) {
      if (used[startId]) return;
      used[startId] = 1;
      var points = [segment.a, segment.b];
      var startKey = segment.aKey;
      var currentKey = segment.bKey;
      var closed = false;
      var guard = 0;
      while (guard++ <= segments.length + 4) {
        if (currentKey === startKey) { closed = true; break; }
        var choices = adjacency.get(currentKey) || [];
        var next = choices.find(function (choice) { return !used[choice.id]; });
        if (!next) break;
        used[next.id] = 1;
        points.push(next.other);
        currentKey = next.otherKey;
      }
      if (closed && points.length > 3) {
        points.pop(); // duplicate start point
        loops.push(removeNearDuplicates(points));
      }
    });
    return loops.filter(function (loop) { return loop.length >= 3 && Math.abs(signedArea(loop)) > .01; });
  }

  function removeNearDuplicates(points) {
    var cleaned = [];
    points.forEach(function (point) {
      var previous = cleaned[cleaned.length - 1];
      if (!previous || Math.hypot(previous.x - point.x, previous.y - point.y) > .0005) cleaned.push(point);
    });
    if (cleaned.length > 2 && Math.hypot(cleaned[0].x - cleaned[cleaned.length - 1].x, cleaned[0].y - cleaned[cleaned.length - 1].y) < .0005) cleaned.pop();
    return cleaned;
  }

  function signedArea(points) {
    var area = 0;
    for (var index = 0; index < points.length; index += 1) {
      var first = points[index];
      var second = points[(index + 1) % points.length];
      area += first.x * second.y - second.x * first.y;
    }
    return area / 2;
  }

  function pointDistanceToSegment(point, first, second) {
    var dx = second.x - first.x;
    var dy = second.y - first.y;
    var lengthSquared = dx * dx + dy * dy;
    if (lengthSquared < EPSILON) return Math.hypot(point.x - first.x, point.y - first.y);
    var t = ((point.x - first.x) * dx + (point.y - first.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(point.x - (first.x + dx * t), point.y - (first.y + dy * t));
  }

  function simplifyOpen(points, tolerance) {
    if (points.length < 3) return points.slice();
    var keep = new Uint8Array(points.length);
    keep[0] = 1;
    keep[points.length - 1] = 1;
    var stack = [[0, points.length - 1]];
    while (stack.length) {
      var pair = stack.pop();
      var maxDistance = -1;
      var split = -1;
      for (var index = pair[0] + 1; index < pair[1]; index += 1) {
        var distance = pointDistanceToSegment(points[index], points[pair[0]], points[pair[1]]);
        if (distance > maxDistance) { maxDistance = distance; split = index; }
      }
      if (maxDistance > tolerance && split > pair[0]) {
        keep[split] = 1;
        stack.push([pair[0], split], [split, pair[1]]);
      }
    }
    return points.filter(function (_, index) { return keep[index]; });
  }

  function simplifyClosed(points, tolerance) {
    if (points.length < 5 || tolerance <= 0) return points.slice();
    var farthest = 1;
    var farthestDistance = -1;
    for (var index = 1; index < points.length; index += 1) {
      var distance = Math.hypot(points[index].x - points[0].x, points[index].y - points[0].y);
      if (distance > farthestDistance) { farthestDistance = distance; farthest = index; }
    }
    var first = simplifyOpen(points.slice(0, farthest + 1), tolerance);
    var second = simplifyOpen(points.slice(farthest).concat([points[0]]), tolerance);
    return first.slice(0, -1).concat(second.slice(0, -1));
  }

  function isCorner(points, index) {
    var count = points.length;
    var previous = points[(index - 1 + count) % count];
    var current = points[index];
    var next = points[(index + 1) % count];
    var ax = current.x - previous.x;
    var ay = current.y - previous.y;
    var bx = next.x - current.x;
    var by = next.y - current.y;
    var aLength = Math.hypot(ax, ay) || 1;
    var bLength = Math.hypot(bx, by) || 1;
    var dot = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (aLength * bLength)));
    return Math.acos(dot) > .9; // retain deliberate turns while smoothing gentle arcs
  }

  function number(value) {
    return Number(value).toFixed(3).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  }

  function smoothLoopPath(points, tension) {
    if (points.length < 3) return '';
    var smoothness = Number.isFinite(tension) ? tension : .72;
    var corners = points.map(function (_, index) { return isCorner(points, index); });
    var d = 'M ' + number(points[0].x) + ' ' + number(points[0].y);
    for (var index = 0; index < points.length; index += 1) {
      var previous = points[(index - 1 + points.length) % points.length];
      var current = points[index];
      var next = points[(index + 1) % points.length];
      var after = points[(index + 2) % points.length];
      if (corners[index] || corners[(index + 1) % points.length]) {
        d += ' L ' + number(next.x) + ' ' + number(next.y);
      } else {
        var controlOne = {
          x: current.x + (next.x - previous.x) * smoothness / 6,
          y: current.y + (next.y - previous.y) * smoothness / 6
        };
        var controlTwo = {
          x: next.x - (after.x - current.x) * smoothness / 6,
          y: next.y - (after.y - current.y) * smoothness / 6
        };
        d += ' C ' + number(controlOne.x) + ' ' + number(controlOne.y) + ' ' + number(controlTwo.x) + ' ' + number(controlTwo.y) + ' ' + number(next.x) + ' ' + number(next.y);
      }
    }
    return d + ' Z';
  }

  function loopsToPath(loops, tolerance, tension) {
    return loops.map(function (loop) {
      return smoothLoopPath(simplifyClosed(loop, tolerance), tension);
    }).filter(Boolean).join(' ');
  }

  function countTopology(imageData, threshold) {
    var width = imageData.width;
    var height = imageData.height;
    var total = width * height;
    var foreground = new Uint8Array(total);
    for (var pixel = 0; pixel < total; pixel += 1) foreground[pixel] = imageData.data[pixel * 4 + 3] / 255 >= threshold ? 1 : 0;
    var visited = new Uint8Array(total);
    var queue = new Int32Array(total);
    var components = [];
    for (var start = 0; start < total; start += 1) {
      if (!foreground[start] || visited[start]) continue;
      var head = 0;
      var tail = 0;
      var minX = width, minY = height, maxX = -1, maxY = -1, area = 0;
      queue[tail++] = start;
      visited[start] = 1;
      while (head < tail) {
        var current = queue[head++];
        var x = current % width;
        var y = Math.floor(current / width);
        area += 1;
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        var neighbours = [current - 1, current + 1, current - width, current + width];
        for (var ni = 0; ni < neighbours.length; ni += 1) {
          var other = neighbours[ni];
          if (other < 0 || other >= total) continue;
          if ((ni === 0 && x === 0) || (ni === 1 && x === width - 1)) continue;
          if (foreground[other] && !visited[other]) { visited[other] = 1; queue[tail++] = other; }
        }
      }
      components.push({ area: area, x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
    }
    var backgroundVisited = new Uint8Array(total);
    var holes = 0;
    for (var backgroundStart = 0; backgroundStart < total; backgroundStart += 1) {
      if (foreground[backgroundStart] || backgroundVisited[backgroundStart]) continue;
      var backgroundHead = 0;
      var backgroundTail = 0;
      var touchesEdge = false;
      queue[backgroundTail++] = backgroundStart;
      backgroundVisited[backgroundStart] = 1;
      while (backgroundHead < backgroundTail) {
        var backgroundCurrent = queue[backgroundHead++];
        var bx = backgroundCurrent % width;
        var by = Math.floor(backgroundCurrent / width);
        if (bx === 0 || by === 0 || bx === width - 1 || by === height - 1) touchesEdge = true;
        var backgroundNeighbours = [backgroundCurrent - 1, backgroundCurrent + 1, backgroundCurrent - width, backgroundCurrent + width];
        for (var bi = 0; bi < backgroundNeighbours.length; bi += 1) {
          var backgroundOther = backgroundNeighbours[bi];
          if (backgroundOther < 0 || backgroundOther >= total) continue;
          if ((bi === 0 && bx === 0) || (bi === 1 && bx === width - 1)) continue;
          if (!foreground[backgroundOther] && !backgroundVisited[backgroundOther]) { backgroundVisited[backgroundOther] = 1; queue[backgroundTail++] = backgroundOther; }
        }
      }
      if (!touchesEdge) holes += 1;
    }
    components.sort(function (first, second) { return second.area - first.area; });
    return { componentCount: components.length, holeCount: holes, components: components };
  }

  function alphaContourCandidates(imageData, options) {
    options = options || {};
    var thresholds = options.thresholds || [.25, .38, .5, .63, .75];
    var tolerances = options.simplifyTolerances || [.2, .45];
    var tension = options.tension == null ? .72 : options.tension;
    var output = [];
    thresholds.forEach(function (threshold) {
      var loops = segmentsToLoops(marchingSegments(imageData, threshold));
      if (!loops.length) return;
      var topology = countTopology(imageData, threshold);
      tolerances.forEach(function (tolerance) {
        var path = loopsToPath(loops, tolerance, tension);
        if (path) output.push({ threshold: threshold, tolerance: tolerance, loops: loops, path: path, loopCount: loops.length, topology: topology });
      });
    });
    return output;
  }

  window.NativeVectorGeometry = {
    alphaContourCandidates: alphaContourCandidates,
    analyzeAlphaComponents: function (imageData, threshold) { return countTopology(imageData, threshold == null ? .5 : threshold); },
    signedArea: signedArea
  };
})();
