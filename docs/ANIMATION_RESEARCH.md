# Animation research notes

The procedural animation in `js/match/` is tuned to measured human movement and NBA tracking data rather than
guessed. This file keeps the numbers the code targets and where they come from, so later tuning stays honest.

## Walking and running (actor.js, anims.js)

| Quantity | Target | Source |
|---|---|---|
| Walk stance / swing share | 60% / 40%, 10% double support at each end | AAPM&R normal gait: https://now.aapmr.org/biomechanics-normal-gait/ |
| Walking knee | ~3-5 deg at contact, ~15 deg loading, ~0-5 deg midstance, ~40 deg toe-off, ~60-65 deg peak swing | Physiopedia joint range during gait: https://www.physio-pedia.com/Joint_Range_of_Motion_During_Gait |
| Heel strike foot angle | toes ~20 deg up, then heel-to-toe roll | https://royalsocietypublishing.org/doi/10.1098/rsos.170818 |
| Walk cadence | walk ratio ~0.0065 m per step/min (scaled by height), ~100-120 steps/min | https://pmc.ncbi.nlm.nih.gov/articles/PMC5387837/ , https://www.sciencedirect.com/science/article/abs/pii/S0966636298000095 |
| Walk to run switch | ~2.0-2.1 m/s | https://www.sciencedirect.com/science/article/abs/pii/S0167945723000635 |
| Step width | 8-12 cm walking, 0-3 cm running | https://www.sciencedirect.com/topics/nursing-and-health-professions/stride-width |
| Running stance share | ~31-39% jog, ~22-25% sprint; knee ~20 deg at contact, up to ~125 deg in swing | https://pubmed.ncbi.nlm.nih.gov/10200378/ , https://www.physio-pedia.com/Running_Biomechanics |
| Vertical bounce | 4-5 cm walking (highest at midstance), 6-9 cm running (lowest at midstance) | https://pubmed.ncbi.nlm.nih.gov/15685471/ |
| Trunk lean | ~9 deg jogging, ~14 deg sprinting | https://www.sciencedirect.com/science/article/pii/S0167945721000658 |
| Arm swing | opposite the legs, nearly straight when walking, bent when running | https://journals.biologists.com/jeb/article/222/13/jeb197228/2704/ |
| Toddler traits to avoid | wide base, flat-foot landing, bent knees in stance, high cadence, arms up, big sway | https://pmc.ncbi.nlm.nih.gov/articles/PMC8946917/ |

## Joint limits (rig.js)

Active ranges of healthy adults (AAOS goniometry norms): shoulder flexion 180 / extension 60, abduction 180,
rotation 70 / 90; elbow 0-150 (no more than ~5 deg hyperextension); wrist 80 / 70; hip flexion 120-125 /
extension 30, abduction 45, rotation 45; knee 0-135 (hyperextension 0-5); ankle 20 / 50; trunk 80 / 25 / 35 / 45;
neck ~50 / 60 / 40 / 70. https://goniometer.io/range-of-motion , https://pubmed.ncbi.nlm.nih.gov/22510944/ (arm swivel).

## Dribbling (ball.js, actor.js)

| Quantity | Target | Source |
|---|---|---|
| Control dribble rate | 1.35-1.43 bounces/s | https://doi.org/10.2466/pms.110.2.469-478 , https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0238318 |
| Ball restitution | 0.76-0.78 (FIBA drop test) | https://assets.fiba.basketball/image/upload/documents-corporate-fiba-official-rules-2024-official-basketball-rules-and-basketball-equipment.pdf |
| Hand on the ball | ~40-55% of the cycle; ride up ~10-15 cm to hip height, push ~25-30 cm down | derived from the rates above |
| Elbow | ~100-120 deg flexed at the catch, ~35-55 deg at the release; elbow beside the body, not across the chest | https://www.academia.edu/1264533/ , https://www.active.com/basketball/articles/basic-dribbling-6 |
| Placement | outside the dribble-side foot, ~0.2 x height from the midline; pushed ahead when running; low (knee) when protected | https://www.coachesclipboard.net/Dribbling.html |
| Crossover | snapped across below the knee, a sharp V | https://xbotgo.com/blogs/knowledge/crossover-dribble |

## Shooting (anims.js, clips.js)

| Quantity | Target | Source |
|---|---|---|
| Catch to release | NBA average 0.54 s (Curry 0.40 s); pull-up 0.8-1.0 s | https://www.breakthroughbasketball.com/fundamentals/Shooting/three-components-of-a-quick-release.html |
| Knee at the bottom of the dip | ~99-101 deg included | https://www.researchgate.net/publication/337387656 , https://training-conditioning.com/news/study-biomechanical-traits-of-the-best-free-throw-shooters/ |
| Jump height | ~25-35 cm on a jump shot; release just before the apex | https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9465762/ |
| Release angle / height | ~50-55 deg, ~2.1 m (ball 30-60 cm above the head); elbow ~158 deg at release | https://www.physio-pedia.com/Biomechanics_of_the_Basketball_Jump_Shot |
| Free throw | ~52 deg, no jump, heels lift at the release | https://www.scientificamerican.com/article/the-math-behind-the-perfect-free-throw/ |
| Follow-through | held ~1 s (until the ball reaches the rim) | https://www.breakthroughbasketball.com/fundamentals/shooting-technique |
| Layup | right-left-jump off the inside foot, opposite knee up, two steps of ~0.25 s, 40-60 cm jump | https://www.coachesclipboard.net/Layup.html |
| Dunk | 70-100 cm jump, hang time ~0.75-0.9 s | https://www.thehoopsgeek.com/dunk-calculator/ |

## Defense, screens, rebounds, passes (choreo.js, poses.js, clips.js)

| Quantity | Target | Source |
|---|---|---|
| Defensive stance | feet wider than the shoulders, hips back, chest over the knees, knees ~120 deg included | https://www.breakthroughbasketball.com/defense/stance |
| Slide | never cross the feet; 2.5-3.5 m/s sustained; drop step / hip turn when beaten | https://ctyeh.com/articles/3139?lang=en |
| Closeout | sprint, then chop steps from ~8 ft, stop at arm's length, high hand | https://hoopmentality.com/blogs/basketball/explaining-defensive-closeouts-a-coachs-complete-guide |
| Contest | jump straight up at the release, ~0.15-0.25 s after the shooter starts up | https://official.nba.com/nba-rule-authority-restricted-area-and-verticality-plays/ |
| Screens | wide base, arms across the chest, hold 1-2 s, roll on contact | https://www.basketballhq.com/setting-screens-in-basketball |
| Rebound | box out, jump ~0.3-0.5 s after the rim, two hands, chin the ball, elbows out | https://www.breakthroughbasketball.com/fundamentals/rebounding-fundamentals-and-tips |
| Passes | 9-13 m/s chest, 14-17 m/s outlet, bounce pass hits the floor 2/3 of the way, windup 0.2-0.35 s | https://pmc.ncbi.nlm.nih.gov/articles/PMC13429921/ |
| On-ball / off-ball defender distance | ~5.4 ft on the ball; 4.2 / 6.8 / 8.9 / 11 ft one, two, three passes away | SportVU tracking analysis (2015-16, 7 games) |

## Half-court movement (flow.js)

From NBA SportVU tracking (2015-16 sample) and NBA.com team tracking: passes ~5.4 per 24 s of half-court time
(Warriors ~6.7, Rockets ~4.8); ~1 rim cut every 8 s; a perimeter relocation every ~2.6 s; off-ball players spend
23% / 44% / 21% / 11% / 1% of the time under 2 / 2-6 / 6-10 / 10-15 / over 15 ft/s; nearest teammate ~14 ft;
idle spells rarely over 3 s. Passes per possession by system: motion / Princeton ~3-3.4, isolation ~2.4-2.6.
https://github.com/linouk23/NBA-Player-Movements , https://github.com/gabriel1200/site_Data

## Player models and rendering (human.js, human_build.js, gl3d.js)

The realistic players start from the MakeHuman 1.1 base mesh, targets and skeleton weights, which the MakeHuman
project released under CC0 1.0 (https://github.com/makehumancommunity/makehuman, LICENSE.ASSETS.md).
`tools/human/build.js` converts them into `js/match/human_data.js`.

| Topic | What the code does | Source |
|---|---|---|
| Body shape | gender = average of MakeHuman's three race targets (no single ancestry baked in); muscle x weight grid with ideal proportions; identity face shapes (jaw, chin, cheekbones, eyes, nose, lips, ears, neck) from `PBC.Identity` | https://github.com/makehumancommunity/makehuman |
| Proportions | ANSUR II tall athletic men: neck girth .203 H, chest .537, waist .470, upper thigh .320, calf .202, biceps .181, forearm .161; bideltoid .266; acromion .826 H; arm segments from the shoulder joint centre | https://github.com/senihberkay/US-Army-ANSUR-II |
| Heads | head length ~200 mm barely grows with stature, so tall players' heads scale less than their bodies | ANSUR II (as above) |
| Twist | forearm pronation / humerus / femur rotation spread along the segment per vertex (no candy-wrapper) | https://users.cs.utah.edu/~ladislav/kavan07skinning/kavan07skinning.pdf |
| Skin | wrap diffuse with a red scatter band; two Beckmann lobes, F0 0.028, oilier and sharper with sweat | https://developer.nvidia.com/gpugems/gpugems/part-iii-materials/chapter-16-real-time-approximations-subsurface-scattering , https://developer.nvidia.com/gpugems/gpugems3/part-iii-rendering/chapter-14-advanced-techniques-realistic-real-time-skin |
| Skin tone | portrait tone kept for lightness, chroma pulled toward measured skin albedo (Fitzpatrick I-VI, linear sRGB) | https://github.com/AntonPalmqvist/physically-based-api |
| Cloth | wrap diffuse 0.5 and Charlie sheen (Filament cloth model) | https://raw.githubusercontent.com/google/filament/main/shaders/src/surface_shading_model_cloth.fs , https://blog.selfshadow.com/publications/s2017-shading-course/imageworks/s2017_pbs_imageworks_sheen.pdf |
| Hair | Kajiya-Kay with shifted tangents | https://web.engr.oregonstate.edu/~mjb/cs557/Projects/Papers/HairRendering.pdf |
| Eyes | sclera albedo ~(0.65, 0.5, 0.39), iris with limbal ring, cornea glint | https://github.com/Unity-Technologies/Graphics (HDRP EyeUtils) |
| Lights | arena 1500-2000 lux, 5000-5700 K, camera white-balanced (neutral); overhead key, far fill, camera fill, warm maple bounce, rim | https://sportsvenuecalculator.com/knowledge/led-sports-lighting/basketball-court-lighting/ , https://steamcdn-a.akamaihd.net/apps/valve/2007/NPAR07_IllustrativeRenderingInTeamFortress2.pdf |
| Tone map | Khronos PBR Neutral (keeps team colours) | https://github.com/KhronosGroup/ToneMapping/tree/main/PBR_Neutral |
| Uniform | shorts waistband ~0.61 H, hem just above the knee (~0.3 H); jersey tucked; loose drape by smoothing an offset of the body | ANSUR II landmarks (as above) |

## Broadcast and watch-sim realism

| Topic | Notes | Source |
|---|---|---|
| Game camera | mid-level at centre court, wide enough for all ten players, moves little; fans reject swaying / zooming experiments | https://www.sportsvideo.org/2018/03/31/live-from-final-four-camera-op-janis-murray-makes-history-taking-over-main-game-camera-position/ , https://awfulannouncing.com/nba/trying-to-make-a-big-game-feel-bigger-with-experimental-camera-angles-isnt-worth-it.html |
| Camera pan | follows the players' formation more than the ball, with lead room and smooth, purposeful motion | https://openaccess.thecvf.com/content_cvpr_2016/papers/Chen_Learning_Online_Smooth_CVPR_2016_paper.pdf |
| Replays | 4x-6x slow motion for highlights, in dead time only | https://smt.com/nba-finals-espn-caps-23rd-nba-season-with-tech-fueled-productions-in-okc-and-indy/ |
| Pace | ~98.8 possessions per 48 min, ~14.5 s per possession; free throw 10 s limit | https://fantasyteamadvice.com/nba/game-pace-data-today , https://videorulebook.nba.com/archive/free-throw-violation-shooter-takes-more-than-10-seconds-to-shoot |
| Sim complaints | skating feet, floaty balls, passive defenders, bodies overlapping, repetitive animation; praise for planted feet and steady TV framing | https://steamcommunity.com/app/3551340/discussions/0/506217282369883622/ , https://nba.2k.com/2k26/courtside-report/gameplay/ |

## Motion and contact fixes from the motion audit

| Topic | What the code does | Source |
|---|---|---|
| Sideways / backpedal gait | a defensive or offensive shuffle keeps the arms quiet (no jog arm swing at shuffle cadence) and the torso still; forward, sideways and backward gait parameters are blended by direction instead of switched | https://www.breakthroughbasketball.com/defense/Debunking-Cross-Feet , https://theorangeduck.com/page/spring-roll-call |
| Body contact | capsule-style push-out on pelvis and chest (torsos lean ahead of the feet), a hard floor, and the closing velocity cancelled at contact so steering slides players around each other | https://www.red3d.com/cwr/papers/1999/gdc99steer.html , https://www.nature.com/articles/35035023 |
| Spacing | off-ball spot targets that sit on top of the ball handler move out to ~14 ft | https://fivethirtyeight.com/features/how-nba-teams-are-bringing-the-post-up-back-to-life |
| Overhead reach | scapulohumeral rhythm: raising the arm past ~70 deg elevates the shoulder girdle (the joint rises ~6-7 cm at full reach) | https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3140083/ |
| Ball in hand | the ball is carried where the hands can hold it when a scripted grip is out of reach; one-hand finishes rest the ball on the palm above the wrist | https://newsroom.2k.com/news/nba-2k21-next-generation-movement-and-impact-engine-revealed-in-second-courtside-report |
| Dunks | thrown down at the rim: a standing putback dunk only from close in, otherwise a short running dunk whose run-up absorbs the distance | https://nba.2k.com/2k26/courtside-report/gameplay/ |
| Free throws | the official catches the ball out of the net and walks to the lane before bouncing it to the shooter (~16 s between free throws in the NBA, compressed) | https://thef5.substack.com/p/long-time-short-king |
| Camera | the ball always stays inside the middle ~60 % of the frame; faster pans when it runs out of the picture | https://openaccess.thecvf.com/content_cvpr_2016/papers/Chen_Learning_Online_Smooth_CVPR_2016_paper.pdf |
