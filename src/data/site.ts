// Site-wide content. Projects live in src/content/projects/ (one Markdown file each).
// Items marked TODO are placeholders. Confirm or replace them before sharing the link.

// public/og.png (the link-preview card) is a one-time render of the name, headline, status, school,
// location, coords, and the first sentence of `about` below. Re-render it when any of those change.
export const profile = {
  name: 'Donald Heddesheimer',
  initials: 'DH',
  headline: 'Systems and GPU software engineer',
  tagline:
    'I build real-time software that senses, simulates, and decides: CUDA radar pipelines, rover autonomy, GPU-parallel control, and the tools to make them fast.',
  status: 'SWE Intern · Solopulse',
  school: "Georgia Tech · B.S. CS '28",
  location: 'Atlanta, GA',
  coords: '33.7756° N, 84.3963° W',
  timezone: 'America/New_York',
  email: 'donaldheddes@gmail.com',
  resume: '/resume.pdf',
  photo: '', // TODO: add public/images/me.jpg and set to '/images/me.jpg'
  about: [
    "I'm a computer science student at Georgia Tech in the Systems Architecture and Devices thread. I like software that has to keep up with the real world: a radar pipeline that has a frame budget, a rover that has to replan before it hits a rock, a controller that has to solve in milliseconds.",
    'Most of my work lands where GPUs, robotics, and simulation meet. When something is slow, I want to know exactly which stage and why.',
  ],
  updated: '2026-09',
};

export const socials = [
  { id: 'github', label: 'GitHub', handle: 'donaldheddesheimer', href: 'https://github.com/donaldheddesheimer', icon: 'github' },
  { id: 'linkedin', label: 'LinkedIn', handle: 'in/donaldheddesheimer', href: 'https://www.linkedin.com/in/donaldheddesheimer/', icon: 'linkedin' },
  { id: 'email', label: 'Email', handle: 'donaldheddes@gmail.com', href: 'mailto:donaldheddes@gmail.com', icon: 'mail' },
] as const;

// Organizations appear as nodes in the entity graph. Projects point at them with `org:` / `related:`.
export type OrgKind = 'education' | 'work' | 'research' | 'team' | 'event' | 'school';
export type Org = { id: string; name: string; short: string; kind: OrgKind; parent?: string };

export const orgs: Org[] = [
  { id: 'gt', name: 'Georgia Institute of Technology', short: 'Georgia Tech', kind: 'education' },
  { id: 'solopulse', name: 'Solopulse', short: 'Solopulse', kind: 'work' },
  { id: 'robonav', name: 'RoboJackets RoboNav', short: 'RoboNav', kind: 'team', parent: 'gt' },
  { id: 'lidar', name: 'Laboratory for Intelligent Decision and Autonomous Robots', short: 'LIDAR Lab', kind: 'research', parent: 'gt' },
  { id: 'bdbi', name: 'Big Data Big Impact @ GT', short: 'Big Data Big Impact', kind: 'research', parent: 'gt' },
  { id: 'steelhacks', name: 'SteelHacks', short: 'SteelHacks', kind: 'event' },
  { id: 'wra', name: 'Western Reserve Academy', short: 'Western Reserve Academy', kind: 'school' },
];

export type Experience = {
  id: string;
  org: string; // org id
  kind: 'work' | 'research' | 'team';
  role: string;
  unit?: string;
  location: string;
  start: string; // YYYY-MM
  end?: string; // YYYY-MM, or leave out if current
  points: string[];
  tags: string[];
};

// Newest first. Copied from the resume.
export const experience: Experience[] = [
  {
    id: 'solopulse',
    org: 'solopulse',
    kind: 'work',
    role: 'Software Engineering Intern',
    location: 'Peachtree Corners, GA',
    start: '2026-05',
    points: [
      'Engineered a real-time radar direction-finding pipeline in C++/CUDA, scanning 131,000+ candidate directions per frame across various sensor channels; deployed and validated during live flight trials at White Sands Missile Range.',
      'Cut per-packet signal-processing latency by ~8× by profiling with NVTX and NVIDIA Nsight Systems, migrating bottleneck operations to the GPU, and introducing plan caching and event-driven scheduling.',
      'Built an end-to-end emitter-geolocation system that fused radar bearings with aircraft position and attitude, intersected lines of bearing with WGS-84, and streamed location estimates to ground software over binary TCP.',
      'Refactored core processing into a testable state machine and built a recorded-sensor replay harness, raising automated test coverage to over 90% across 160 GoogleTest cases.',
    ],
    tags: ['C++', 'CUDA', 'Performance', 'Nsight', 'GoogleTest', 'TCP/IP'],
  },
  {
    id: 'robonav',
    org: 'robonav',
    kind: 'team',
    role: 'Autonomous Navigation Software Developer',
    unit: 'University Rover Challenge',
    location: 'Atlanta, GA',
    start: '2025-01',
    end: '2026-05',
    points: [
      'Cut median replans by 45% on a fixed obstacle-course suite by unifying planner/controller grid-map semantics and feeding Gaussian-inflated LiDAR terrain costs into a custom ROS 2 C++ A* planner on a Jetson Orin Nano.',
      'Achieved up to 2.5 cm global position accuracy under RTK-fixed conditions using a dual-EKF architecture that fused base-station-corrected RTK GNSS, wheel odometry, and VectorNav IMU data for smooth local motion and global drift correction.',
      'Accelerated the full Gazebo navigation regression suite by 10× using parallel, parameterized scenarios built from competition-site DEMs and calibrated robot/sensor models; gated every merge with builds, tests, linting, and formatting in GitHub CI.',
    ],
    tags: ['C++', 'Robotics', 'Simulation', 'ROS 2', 'Gazebo', 'EKF'],
  },
  {
    id: 'lidar',
    org: 'lidar',
    kind: 'research',
    role: 'Undergraduate Research Assistant',
    location: 'Atlanta, GA',
    start: '2025-08',
    end: '2026-05',
    points: [
      'Co-developed an RL-augmented model predictive control (MPC) framework for bipedal locomotion that achieved 86% success versus a 1% baseline on 10 cm stairs in NVIDIA Isaac Lab by adapting its dynamics model, swing trajectories, and gait timing.',
      'Built a sparse GPU optimization solver that ran MPC across 4,096 Isaac Lab environments in parallel, cutting solve time from 10+ seconds to about 200 ms (~50×) and accelerating end-to-end policy training by over 20×.',
      "Implemented FastSAC and PPO in the lab's PyTorch-based RLOpt framework and repaired FastSAC's replay-buffer insertion and sampling path, restoring stable multi-hour humanoid imitation training with sustained return and episode-length gains.",
    ],
    tags: ['Python', 'PyTorch', 'Robotics', 'Simulation', 'Reinforcement learning', 'Isaac Lab', 'MPC'],
  },
  {
    id: 'bdbi',
    org: 'bdbi',
    kind: 'research',
    role: 'Machine Learning Researcher',
    unit: 'Agricultural Productivity Forecast for Zero Hunger',
    location: 'Atlanta, GA',
    start: '2024-08',
    end: '2025-05',
    points: [
      'Worked with a research team to build a three-stage agricultural ML pipeline combining satellite and tabular data, achieving 0.92 Dice for U-Net cropland segmentation, 89% accuracy for 10-class LSTM crop classification, and R² = 0.977 for yield regression.',
      'Cut multi-terabyte satellite-data preprocessing time by up to 100× by parallelizing Sentinel Hub API requests and building a Redis geospatial cache that processed only uncached portions of overlapping Landsat and Sentinel tiles.',
    ],
    tags: ['Python', 'Machine learning', 'Computer vision', 'Redis', 'U-Net', 'LSTM'],
  },
];

export const education = {
  org: 'gt',
  school: 'Georgia Institute of Technology',
  program: 'Honors Program',
  degree: 'B.S. in Computer Science',
  thread: 'Systems Architecture & Devices',
  gpa: '3.95 / 4.00',
  start: '2024-08',
  end: '2028-05',
  coursework: ['Operating Systems', 'Processor Design', 'Computer Architecture', 'Computer Networks', 'Algorithms'],
};

// The homepage opens on this record. Its simulation is illustrative, not recorded data.
export const mission = {
  exp: 'robonav',
  title: 'Rover autonomy',
};

// From the resume's skills section.
export const skills: { group: string; items: string[] }[] = [
  { group: 'Languages', items: ['C++17/20', 'CUDA C++', 'Python'] },
  {
    group: 'GPU & real-time systems',
    items: ['Nsight Systems / Compute', 'NVTX', 'CUDA Events / Graphs', 'Perfetto', 'Multithreading', 'TCP/IP', 'Linux'],
  },
  {
    group: 'Robotics & control',
    items: ['ROS 2', 'Gazebo', 'NVIDIA Isaac Lab', 'Jetson Orin Nano', 'MPC', 'EKF', 'A*', 'RTK GNSS', 'URDF / Xacro'],
  },
  { group: 'ML & data', items: ['PyTorch', 'PPO', 'SAC', 'U-Net', 'LSTM', 'Weights & Biases', 'Redis'] },
  { group: 'Dev & infrastructure', items: ['CMake', 'GoogleTest', 'Git', 'GitHub Actions', 'Docker', 'Slurm'] },
];

// Hobby photos go in public/images/. Leave `image` out for a text-only tile.
export const offDuty: { id: string; name: string; note: string; image?: string; imageAlt?: string; primary?: boolean; link?: { label: string; href: string } }[] = [
  {
    id: 'volleyball',
    name: 'Volleyball',
    note: 'The biggest one. Most of my free time goes to the court.', // TODO: team name / position if you want it here
    image: '/images/volleyball.jpg',
    imageAlt: 'Donald going up for a spike in a Georgia Tech jersey',
    primary: true,
  },
  { id: 'robotics', name: 'Robotics', note: 'From FRC swerve code in high school to rover autonomy at RoboJackets.' },
  {
    id: 'reading',
    name: 'Reading',
    note: 'Mostly fantasy. Long series with a well-built magic system are my weakness.',
    // TODO: paste your Goodreads profile URL here
    // link: { label: 'Goodreads', href: 'https://www.goodreads.com/user/show/...' },
  },
  { id: 'hiking', name: 'Hiking', note: 'Getting out of Atlanta and onto a trail whenever I can.' },
];
