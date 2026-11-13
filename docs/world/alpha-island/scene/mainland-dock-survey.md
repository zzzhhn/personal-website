# Mainland ferry berth — source survey candidate

2026-11-13. Scene baseline6205018/r3. This is a candidate for coordinator review, not a live acceptance or permission to alter old facilities.

Exact WorldLandform.meshHeight source was bundled with esbuild and sampled in Node with default v4. The provisional r1 berth at world[-16,57] and boat root[-16,64] are on LAND, not water: meshHeight is 1.0386 at z57 and 1.0 at z64/68/72/76/80. The old outline did not include the complete southern landform. Do not ship that provisional ferry line.

At x=-16: z84=1.01623, z88=.65293, z92=.08413, z96=-.55560, z100=-.96296, z104=-1.37122, z108=-1.76623, z112=-2.17104, z116=-3.18091, z120=-5.85965. WATER_Y=-.7. A walkable pier from dry[-16,1,81] to deck[-16,1.14,106] can reach open water without crossing Club. Candidate mainland boat floor root[-16,.8,112], heading +Z; side gangway from pier to real starboard door. Deck reaches z111.5 but is offset enough to keep hull separate. A supported timber path toward old south main-road end[-12,1,43] provides access, not a new expanded terrain grid.

At island end, provisional boat[147,.8,146] would put the 7m-long ferry bow into the dock/earth because approach was diagonal +X. Candidate root[143,.8,146], final approach straight +Z at x143 (last20m), lies alongside the west dock edge x147.5. The island socket remains local[-82,1.3,-44] = world[153,1.3,146]. Vehicle and dock do not share a guessed transform. Traffic owns bridge/seat/door integration.

Candidate water route WORLD: [-16,-.7,112],[-16,-.7,125],[61,-.7,132],[126,-.7,128],[143,-.7,126],[143,-.7,136],[143,-.7,146]. These are waterline datums, traffic maps to its .8m vehicle floor. Must still check actual interpolated ferry hull across old/new terrain, entire gangway/foot route, physics/camera and ordinary views. Main coordinator decides final mainland dock after this evidence and integration test.

No existing facility removed. This source survey establishes the earlier location was invalid; it does not establish the candidate is final.

R4 coordinator review corrected the initial platform proposal: actual ferry source length is8.35m, not7m. A centred platform[-16,106] would overlap its stern. Revised explicit polygon places platform EAST at center[-10,112], width7/length11 => x[-13.5,-6.5],z[106.5,117.5]; ferry remainsroot[-16,.8,112], +Z. Boardwalk2.8m wide runs x[-11.4,-8.6],z[70,106.5]. Starboard boarding opening is on west rail atz111.3..114; all other side rails retained. This side offset is part of actual code data, not an assumed drawing. Hull/rail/pier and complete-route tests still required.
