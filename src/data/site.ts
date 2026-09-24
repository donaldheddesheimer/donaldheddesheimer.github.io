// All site content lives here. Edit this file; the page rebuilds itself.
// Items marked TODO are placeholders or guesses — confirm or replace them before going live.

export const profile = {
  name: 'Donald Heddesheimer',
  firstName: 'Donald',
  tagline: 'Software engineer into ML, simulation, and making hardware go fast.',
  // TODO: confirm role/company line
  role: 'Software Engineer',
  location: 'Atlanta, GA',
  timezone: 'America/New_York',
  email: 'donaldheddes@gmail.com',
  resume: '/resume.pdf', // TODO: drop your resume into public/resume.pdf
  photo: '', // TODO: add public/images/me.jpg and set to '/images/me.jpg'
  about: [
    "I like building things that learn, simulate, or move — from a waste-sorting CNN in high school to CUDA kernels and reinforcement-learning research today.",
    // TODO: add a sentence about school / current work
    'Outside of code you can find me at a hackathon, on a volleyball court, or deep in some side project that started as "just a quick script."',
  ],
  now: {
    label: 'Currently building',
    text: 'Fluxion, a data-oriented C++ simulation game on raylib',
    href: 'https://github.com/donaldheddesheimer/fluxion',
  },
};

export const socials = [
  { label: 'GitHub', href: 'https://github.com/donaldheddesheimer', icon: 'github' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/', icon: 'linkedin' }, // TODO: your LinkedIn URL
  { label: 'Instagram', href: 'https://www.instagram.com/', icon: 'instagram' }, // TODO: your handle, or remove
  { label: 'Email', href: `mailto:${profile.email}`, icon: 'mail' },
] as const;

export const skills: { group: string; items: string[] }[] = [
  { group: 'Languages', items: ['Python', 'C++', 'CUDA', 'Java', 'C#', 'Lua', 'SQL', 'TypeScript'] },
  { group: 'ML & Sim', items: ['PyTorch', 'TorchRL', 'TensorFlow', 'NumPy', 'Isaac Lab', 'SUMO'] },
  { group: 'Web & Tools', items: ['Django', 'Astro', 'Git', 'Linux', 'Nsight', 'raylib'] },
];

export type Experience = {
  role: string;
  org: string;
  when: string;
  points: string[];
};

// TODO: replace with your real experience (newest first)
export const experience: Experience[] = [
  {
    role: 'Software Engineer',
    org: 'Company name',
    when: '2026 – Present',
    points: ['What you built, with a number if you have one.', 'Tech you used and the impact it had.'],
  },
  {
    role: 'Role title',
    org: 'Organization',
    when: '2025',
    points: ['Short, specific bullet.', 'Another one.'],
  },
  {
    role: 'Student',
    org: 'University — Degree',
    when: 'Expected 20XX',
    points: ['Relevant coursework, clubs, or teams.'],
  },
];

export type Project = {
  name: string;
  blurb: string;
  tags: string[];
  href?: string;
  demo?: string;
  featured?: boolean;
  year?: string;
};

export const projects: Project[] = [
  {
    name: 'Traffic Operations Center',
    blurb:
      'Detects a live collision, snapshots the city, rehearses eight candidate responses in simulation, and commits only the one that passes a safety gate. Built at SteelHacks 2026.',
    tags: ['Python', 'Simulation', 'Hackathon'],
    href: 'https://github.com/donaldheddesheimer/traffic-sim',
    featured: true,
    year: '2026',
  },
  {
    name: 'nn: MNIST three ways',
    blurb:
      'The same MLP written in NumPy, a C++ CPU baseline, and CUDA, with a hand-tiled GEMM benchmarked against cuBLAS using roofline analysis and Nsight.',
    tags: ['CUDA', 'C++', 'Python'],
    href: 'https://github.com/donaldheddesheimer/nn',
  },
  {
    name: 'RLOpt',
    blurb:
      'A modular reinforcement learning research framework on PyTorch and TorchRL for comparing agents and optimization techniques, configured with Hydra.',
    tags: ['PyTorch', 'TorchRL', 'Research'],
    href: 'https://github.com/donaldheddesheimer/RLOpt',
  },
  {
    name: 'Fluxion',
    blurb:
      'A top-down simulation game for learning game loops, data-oriented design, and performance engineering, working toward large-scale agent simulation.',
    tags: ['C++', 'raylib', 'Game dev'],
    href: 'https://github.com/donaldheddesheimer/fluxion',
  },
  {
    name: 'TravelMate',
    blurb:
      'A Django trip planner with weather forecasts, generated packing lists, travel tips, and an AI travel assistant.',
    tags: ['Django', 'Python', 'Web'],
    href: 'https://github.com/donaldheddesheimer/TravelMate',
    demo: 'https://travelmate-jv1d.onrender.com/',
  },
  {
    name: 'Smart Bin',
    blurb:
      'A ResNet50 transfer-learning classifier that sorts waste into six categories at 95%+ accuracy, trained on images from Western Reserve Academy.',
    tags: ['TensorFlow', 'Computer vision'],
    href: 'https://github.com/donaldheddesheimer/Smart-Bin',
  },
  {
    name: 'Swerve Drive',
    blurb:
      "FRC robot code on WPILib that turns controller input into per-wheel angles and speeds for a four-module swerve drive.",
    tags: ['Java', 'Robotics'],
    href: 'https://github.com/donaldheddesheimer/Swerve-Drive-Robotics',
  },
  {
    name: 'Useless Machine',
    blurb: 'A wooden box with a switch. Flip it, the lid opens, and a finger flips it back. My first project ever.',
    tags: ['Hardware', 'Woodworking'],
    href: 'https://github.com/donaldheddesheimer/Useless-Machine',
  },
];

// TODO: these are guesses from your repos — keep, edit, or swap in real ones.
// `image` is optional: drop a photo in public/images/ and reference it as '/images/volleyball.jpg'.
export const hobbies: { emoji: string; name: string; note: string; image?: string }[] = [
  { emoji: '🏐', name: 'Volleyball', note: 'Played enough to build a stat tracker for it.' },
  { emoji: '🤖', name: 'Robotics', note: 'FRC alum. Still like things with motors.' },
  { emoji: '🧩', name: 'Competitive programming', note: 'A folder full of leftover contest problems.' },
  { emoji: '⚡', name: 'Hackathons', note: 'Most recently SteelHacks 2026.' },
  { emoji: '🃏', name: 'Poker math', note: 'Mostly the probability side.' },
  { emoji: '🎮', name: 'Games', note: 'Sometimes I model the in-game economy instead of playing.' },
];
