import type {
  Goal,
  MacroTargets,
  MealOption,
  ScheduleBlock,
  WatchItem,
  Workout,
} from './types'

// ————————————————————————————————————————————————
// The Blueprint — Executive Operating System (V5)
// Preloaded from Tom's weekly plan PDF.
// ————————————————————————————————————————————————

export const DAY_CODENAMES = [
  'BASE OPERATIONS',
  'PUSH VELOCITY',
  'PULL & PRECISION',
  'ENGINE BUILDING',
  'LEGS & ENVIRONMENTAL RESET',
  'DEEP MASTERY',
  'STRATEGIC SYSTEMS AUDIT',
] as const

let n = 0
const id = (p: string) => `${p}-${++n}`

const B = (
  weekday: number,
  start: string,
  end: string,
  title: string,
  tag: ScheduleBlock['tag'],
  detail?: string,
): ScheduleBlock => ({ id: id('blk'), weekday: weekday as ScheduleBlock['weekday'], start, end, title, tag, detail })

export const seedSchedule: ScheduleBlock[] = [
  // MONDAY — BASE OPERATIONS
  B(0, '06:30', '07:00', 'Ignition Protocol', 'morning', 'Hydrate fully · 10 min mobility (hip/shoulder) · 15 min physical book'),
  B(0, '07:00', '07:30', 'Fuel Target', 'meal', 'High-protein, high-carb performance breakfast'),
  B(0, '07:46', '08:30', 'Transit — Bus 357', 'school', 'Shift focus to academic strategy'),
  B(0, '08:30', '16:15', 'Academic Block', 'school', 'Gymnasium · keep hydration above 1.5L before exit'),
  B(0, '16:40', '19:00', 'AURORA Deep Work', 'business', 'Supply logistics, asset building, campaign analytics'),
  B(0, '19:00', '20:00', 'Dinner & Reset', 'meal', 'High-volume whole food meal · kitchen cleanup'),
  B(0, '20:00', '22:00', 'Academic Clearance', 'study', 'Assignments, exam prep, schedule audit'),
  B(0, '22:00', '22:30', 'System Shutdown', 'recovery', 'Screen blackout · stretching · magnesium · sleep lock 22:30'),

  // TUESDAY — PUSH VELOCITY
  B(1, '06:30', '07:46', 'Morning Protocol', 'morning', 'Wake · mobility · 15-min read · high-carb fuel · transit'),
  B(1, '08:30', '15:25', 'Academic Block', 'school'),
  B(1, '16:00', '17:15', 'Gym — Push + Arms', 'gym', 'Hyper-targeted upper volume routine'),
  B(1, '17:30', '19:00', 'Post-Workout + AURORA', 'business', 'Isolate protein/carb shake · 75-min business review'),
  B(1, '19:00', '20:00', 'Dinner & Reset', 'meal', 'Whole food re-feed · clean room + workspace'),
  B(1, '20:00', '22:00', 'Study / Disconnect', 'study', 'Wrap coursework · socialization · cognitive offload'),
  B(1, '22:00', '22:30', 'Blackout', 'recovery', 'Screen zeroing · sleep initiation 22:30'),

  // WEDNESDAY — PULL & PRECISION
  B(2, '06:30', '07:46', 'Morning Protocol', 'morning', 'Ignition sequence · reading block · breakfast · transit'),
  B(2, '08:30', '15:25', 'Academic Block', 'school'),
  B(2, '16:00', '17:15', 'Gym — Pull + Core', 'gym', 'Posterior chain density + core stabilizers'),
  B(2, '17:45', '19:00', 'Basement Golf Simulator', 'golf', 'Chipping distance ladder · 12-inch putting gate drills'),
  B(2, '19:00', '20:00', 'Dinner & Reset', 'meal', 'Macro recovery dinner · kitchen clean'),
  B(2, '20:00', '22:00', 'AURORA Deployment', 'business', 'Store design, asset editing, operational planning'),
  B(2, '22:00', '22:30', 'Blackout', 'recovery', 'Sensory wind-down · sleep 22:30'),

  // THURSDAY — ENGINE BUILDING
  B(3, '06:30', '07:46', 'Morning Protocol', 'morning', 'Wake · stretch · read · fuel · transit'),
  B(3, '08:30', '15:25', 'Academic Block', 'school', 'Consistent hydration targets'),
  B(3, '16:15', '17:00', 'Running Engine Block', 'run', '45 min Zone 2 · 60–70% max HR · nasal breathing'),
  B(3, '17:15', '19:00', 'AURORA Deep Sprint', 'business', 'Business development + automation systems'),
  B(3, '19:00', '20:00', 'Dinner & Reset', 'meal', 'High-carb fuel meal · workspace clean'),
  B(3, '20:00', '22:00', 'Social / Open Window', 'social', 'Family, friends, total cognitive relaxation'),
  B(3, '22:00', '22:30', 'Blackout Routine', 'recovery', 'Dark mode · magnesium · sleep 22:30'),

  // FRIDAY — LEGS & ENVIRONMENTAL RESET
  B(4, '06:30', '07:46', 'Morning Protocol', 'morning', 'Standard ignition · 15-min read · carb fuel · transit'),
  B(4, '08:30', '12:05', 'Academic Block (early finish)', 'school', 'Pivot immediately to performance tracks'),
  B(4, '13:00', '14:15', 'Gym — Legs: Power & Density', 'gym', 'Heavy mechanical tax for hypertrophy'),
  B(4, '15:00', '16:30', 'Basement Golf Simulator', 'golf', 'Cold 1-shot pressure training sequence'),
  B(4, '16:30', '19:00', 'Deep Environmental Reset', 'recovery', 'Deep clean bedroom + bathroom · system organization'),
  B(4, '19:00', '20:00', 'Dinner & Reset', 'meal', 'High-density protein + carb load · kitchen reset'),
  B(4, '20:00', '', 'Open Weekend Block', 'social', 'Disconnect completely · personal flexibility'),

  // SATURDAY — DEEP MASTERY
  B(5, '07:30', '09:00', 'Recovery Wake & Fuel', 'morning', 'Controlled extra rest · clean high-calorie breakfast'),
  B(5, '09:00', '11:00', 'German Mastery', 'language', 'Private German lesson · complete focus'),
  B(5, '11:30', '12:45', 'Gym — Whole Upper / Weak Points', 'gym', 'Delts, arms, upper structural lines'),
  B(5, '14:30', '17:30', 'AURORA Scale Session', 'business', '3-hour heavy workflow: marketing assets, store builds, data audits'),
  B(5, '19:00', '20:00', 'Dinner & Reset', 'meal', 'Quality family meal · kitchen cleanup'),

  // SUNDAY — STRATEGIC SYSTEMS AUDIT
  B(6, '08:00', '09:15', 'Pre-Golf Fuel', 'meal', 'Clean, digestible high-carb breakfast'),
  B(6, '10:00', '12:00', 'On-Course Coach Execution', 'golf', 'Pro-level short game validation + pressure strategies'),
  B(6, '14:00', '16:30', 'Academic Clearance', 'study', 'Finalize homework · prep folders · remove Monday friction'),
  B(6, '16:30', '19:00', 'High-Volume Meal Prep', 'meal', 'Batch cook rice/potatoes + lean proteins'),
  B(6, '19:00', '20:00', 'Dinner & Reset', 'meal', 'Whole food fueling block · kitchen reset'),
  B(6, '20:00', '21:30', 'Systems Audit', 'recovery', 'Log weight · review business pipeline · lay out gear · sleep by 22:30'),
]

const E = (name: string, sets: number, reps: string, cue: string) => ({ id: id('ex'), name, sets, reps, cue })

export const seedWorkouts: Workout[] = [
  {
    id: 'w-push',
    name: 'Push + Arms',
    weekday: 1,
    exercises: [
      E('Dumbbell Press', 3, '8-10', 'Heavy load. Full eccentric stretch, explosive drive.'),
      E('Chest Press (Machine)', 2, '8-10', 'Scapula pinned. Continuous mechanical tension.'),
      E('Pec Deck', 2, '8-10', 'Hard internal squeeze at peak. Avoid shoulder roll.'),
      E('Cable Hammer Curl', 2, '8-10', 'Elbows static. Max load for brachialis thickness.'),
      E('Lateral Raises', 3, '10', 'Strict form. Lead with outer deltoid.'),
      E('Bicep Curl', 2, '10', 'Full supination at peak. Control the eccentric.'),
      E('Reverse Bicep Curl', 2, '10-12', 'Overhand lock. Forearm extensor focus.'),
    ],
  },
  {
    id: 'w-pull',
    name: 'Pull + Core',
    weekday: 2,
    exercises: [
      E('Lat Pulldown (Wide Grip)', 4, '8-10', 'Drive through elbows. Upper lat flare.'),
      E('Chest-Supported Row', 4, '8-12', 'Strict mid-back squeeze. No momentum.'),
      E('Cable Pullover', 3, '10-12', 'Deep overhead stretch. Arms long to isolate lats.'),
      E('Rear Delt Fly', 3, '12-15', 'High volume for back-to-front shoulder symmetry.'),
      E('Cable Crunches', 4, '12', 'Controlled spinal flexion. Isolate rectus abdominis.'),
    ],
  },
  {
    id: 'w-legs',
    name: 'Legs: Density & Power',
    weekday: 4,
    exercises: [
      E('Squats or Leg Press', 4, '8-10', 'Controlled deep eccentric. Drive from heels.'),
      E('Romanian Deadlift', 4, '6-10', 'Hinge deeply. Protect lumbar; max hamstring/glute load.'),
      E('Bulgarian Split Squat', 3, '8-12 /leg', 'Unilateral stabilization. Deep mechanical hypertrophy.'),
      E('Lying Hamstring Curl', 3, '10', 'Strict isolation at peak. No hip lifting.'),
      E('Seated Calf Raises', 4, '12-20', 'Pronounced stretch at base, hard squeeze at top.'),
    ],
  },
  {
    id: 'w-upper',
    name: 'Whole Upper & Finishers',
    weekday: 5,
    exercises: [
      E('Seated DB Shoulder Press', 3, '8-10', 'Vertical trajectory. Keep shoulders stable.'),
      E('Incline Machine Press', 3, '10', 'Upper clavicular fibers. Shoulder blades locked.'),
      E('Cable Lateral Raise', 4, '12-15', 'Constant tension across full lateral range.'),
      E('Tricep Rope Pushdown', 3, '10-12', 'Pronate wrists at base for the lateral head.'),
      E('Face Pulls', 3, '12-15', 'Corrective for golf stance posture.'),
    ],
  },
]

export const seedGoals: Goal[] = [
  {
    id: 'g-physique',
    pillar: 'physique',
    title: 'Aesthetic Hypertrophy & Physique',
    target: 'Lean, dense 87–90 kg by end of July/August 2026',
    deadline: '2026-08-31',
    progress: 0,
    milestones: [
      { id: id('m'), title: 'Hold lean surplus for 4 straight weeks', done: false },
      { id: id('m'), title: 'V-taper width: add 2cm to shoulder circumference', done: false },
      { id: id('m'), title: 'Hit 87 kg lean', done: false },
      { id: id('m'), title: 'Hit 90 kg lean', done: false },
    ],
    notes: 'High-precision volume split. Recovery parameters non-negotiable — protein synthesis + CNS health.',
  },
  {
    id: 'g-golf',
    pillar: 'golf',
    title: 'Elite Golf Mastery',
    target: 'Drop 2.4 handicap to a progressive PLUS handicap',
    deadline: null,
    progress: 0,
    milestones: [
      { id: id('m'), title: 'Handicap 2.0', done: false },
      { id: id('m'), title: 'Handicap 1.0', done: false },
      { id: id('m'), title: 'Scratch (0.0)', done: false },
      { id: id('m'), title: 'Plus handicap', done: false },
    ],
    notes: 'Weekly on-course coach sessions + mid-week simulator metrics: distance control ladders, gate drills. Ground force mechanics without lifting interference.',
  },
  {
    id: 'g-business',
    pillar: 'business',
    title: 'AURORA — Business Development & Scaling',
    target: 'Automate + execute high-leverage infrastructure for the AURORA Smart Ring',
    deadline: null,
    progress: 0,
    milestones: [
      { id: id('m'), title: 'Store build complete', done: false },
      { id: id('m'), title: 'Supplier system locked', done: false },
      { id: id('m'), title: 'First $100/day', done: false },
      { id: id('m'), title: '$1,000/day revenue', done: false },
    ],
    notes: 'Protect prime morning + mid-afternoon cognitive windows. Content production, asset creation, marketing analytics, supplier systems.',
  },
  {
    id: 'g-recovery',
    pillar: 'recovery',
    title: 'System Recovery Standard',
    target: '22:30 blackout → 06:30 wake. 8 full hours, every night.',
    deadline: null,
    progress: 0,
    milestones: [
      { id: id('m'), title: '7-day blackout streak', done: false },
      { id: id('m'), title: '30-day blackout streak', done: false },
    ],
    notes: 'Tue Push/Arms · Wed Pull/Core · Fri Legs · Sat Whole Upper. Sunday fully clear for golf execution.',
  },
]

export const seedMacros: MacroTargets = {
  kcal: [3600, 3900],
  protein: [190, 220],
  carbs: [450, 550],
  fat: [70, 90],
  waterMl: 3000,
}

export const seedMeals: MealOption[] = [
  { id: id('meal'), window: 'Breakfast', name: 'High-Protein Porridge', detail: '80–100g whole oats · 1.5 scoops whey isolate · 1 large banana · mixed berries' },
  { id: id('meal'), window: 'Breakfast', name: 'Eggs & Sourdough', detail: '3–4 organic whole eggs · 2 thick slices toasted sourdough · wilted baby spinach · sea salt' },
  { id: id('meal'), window: 'Lunch', name: 'Clean Chicken Rice Bowl', detail: '180g seasoned chicken breast · 1.5–2 cups jasmine rice · EVOO · greens' },
  { id: id('meal'), window: 'Lunch', name: 'Beef Mince Pasta', detail: '150g extra lean beef mince · 150g dry wheat pasta · organic tomato passata' },
  { id: id('meal'), window: 'Dinner', name: 'Teriyaki Salmon', detail: '180–200g wild salmon · 1.5 cups white rice · steamed asparagus or broccoli' },
  { id: id('meal'), window: 'Dinner', name: 'Lean Chilli Prep', detail: '180g lean beef steak mince · red kidney beans · high-volume white rice' },
  { id: id('meal'), window: 'Performance Snack', name: 'Anabolic Shake', detail: '1.5 scoops whey isolate · 1 banana · 5g creatine monohydrate' },
  { id: id('meal'), window: 'Performance Snack', name: 'High-Volume Skyr Parfait', detail: '300g skyr or Greek yogurt · raw honey · organic berries' },
]

export const seedWatchlist: WatchItem[] = [
  { id: id('watch'), kind: 'crypto', symbol: 'BTC', cgId: 'bitcoin', name: 'Bitcoin' },
  { id: id('watch'), kind: 'crypto', symbol: 'ETH', cgId: 'ethereum', name: 'Ethereum' },
  { id: id('watch'), kind: 'crypto', symbol: 'SOL', cgId: 'solana', name: 'Solana' },
  { id: id('watch'), kind: 'stock', symbol: 'AAPL', name: 'Apple' },
  { id: id('watch'), kind: 'stock', symbol: 'NVDA', name: 'NVIDIA' },
]

export const seedHandicap = { id: id('hcp'), date: '2026-07-01', value: 2.4 }
