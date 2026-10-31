// Content: title, ending, areas, panels. Photos are looked up in assets/photos/.

const TITLE = {
  name: 'The Mountain Trail',
  quote: 'Every trail begins with a single step.',
  start: 'Start the hike',
  hint: 'Use ← → or A / D to walk · press E at a marker',
};

// Set to a file under assets/audio/ to use a custom loop instead of the
// generated score.
const BGM_FILE = null;

const ENDING = {
  lines: [
    'Thanks for walking this trail with me.',
    'See you on the next one <3',
  ],
  again: 'Walk it again',
};

// Areas, in walking order. Positions are in the scene's own pixel space.
// props: extra sprites placed beside a marker. lift: prompt height above the
// marker. shadow: dx/spread/alpha for her ground shadow. dust: footstep
// puff color. ambient: decorative particles (front: true draws in front).
const AREAS = [
  {
    id: 'camp',
    name: 'Base Camp',
    elevation: '0m',
    elevSprite: 'elev_0',
    shadow: { dx: -5, spread: 1.05, alpha: 0.36 },   // low sun behind the hills
    dust: '#e0c69a',
    ambient: {
      glow:   [{ x: 730, y: 505, r: 72, color: 'rgba(255,150,52,0.5)', alpha: 0.42, pulse: 7 },
               { x: 785, y: 465, r: 24, color: 'rgba(255,196,110,0.5)', alpha: 0.30, pulse: 3 }],
      embers: [{ x: 730, y: 528, rate: 5, color: '#ffb454' }],
      motes:  [{ count: 22, band: [350, 500], color: '#ffe7b8', drift: -7,
                 alpha: 0.7, size: 2, flutter: 5 }],
    },
    hotspots: [
      { x: 870, panel: 'camp', label: 'The tent', lift: 150 },   // the tent in the painting
    ],
  },
  {
    id: 'valley',
    name: 'Valley',
    elevation: '850m',
    elevSprite: 'elev_850',
    shadow: { dx: -2, spread: 0.95, alpha: 0.32 },   // bright overhead daylight
    dust: '#dcbd8b',
    ambient: {
      motes: [{ count: 22, band: [400, 535], color: '#ffffff', drift: -16,
                alpha: 0.85, size: 2, flutter: 12 },
              { count: 12, band: [420, 535], color: '#ffc2da', drift: -26,
                alpha: 0.95, size: 3, flutter: 24, front: true }],
    },
    hotspots: [
      {
        x: 650, panel: 'valley', label: 'Journal & TikTok',
        props: [{ name: 'sign_arrows', scale: 0.5, dx: 90 }],
      },
    ],
  },
  {
    id: 'forest',
    name: 'Forest',
    elevation: '1350m',
    elevSprite: 'elev_1350',
    shadow: { dx: 0, spread: 1.15, alpha: 0.40 },    // backlit, soft and wide
    dust: '#c8d2c0',
    ambient: {
      fireflies: [{ count: 20, x0: 50, x1: 1300, band: [370, 505], color: '#e6ffa0', alpha: 1 },
                  { count: 8, x0: 50, x1: 1300, band: [430, 515], color: '#f2ffc0',
                    alpha: 1, front: true }],
      motes:     [{ count: 10, band: [280, 450], color: '#ffe0b0', drift: -5,
                    alpha: 0.3, size: 2, flutter: 4 }],
    },
    hotspots: [
      {
        x: 445, panel: 'cucphuong', label: 'Cúc Phương',
        props: [{ name: 'sign_thisway', scale: 0.5, dx: 0 }],
      },
      {
        x: 565, panel: 'bachkhoa', label: 'Bách Khoa',
        props: [{ name: 'icon_tubes', scale: 0.55, dx: 75 }],
      },
    ],
  },
  {
    id: 'summit',
    name: 'Summit',
    elevation: '2031m',
    elevSprite: 'elev_2031',
    // A path area: she climbs a polyline instead of walking a straight line.
    // shrinkTo scales her down as she climbs (1 at the foot, 0.5 at the top).
    path: [
      [678, 765], [675, 700], [672, 640], [670, 580], [672, 520], [678, 465],
    ],
    shrinkTo: 0.5,
    stepFps: 28,   // slower pace than the other areas, for the climb
    shadow: { dx: -6, spread: 1.15, alpha: 0.3 },   // low sun off to the upper right
    dust: '#cdbf9e',
    ambient: {
      glow:   [{ x: 677, y: 435, r: 55, color: 'rgba(255,150,60,0.5)', alpha: 0.42, pulse: 6 }],
      embers: [{ x: 677, y: 448, rate: 4, color: '#ffb454' }],
      motes:  [{ count: 14, band: [520, 700], color: '#e9e2f2', drift: -5,
                 alpha: 0.3, size: 2, flutter: 4 }],
    },
    hotspots: [
      { x: 270, panel: 'summit', label: 'The letter', lift: 100 },
    ],
  },
];

// Panels. A panel is one or more tabs; a tab is a run of pages.
// Layouts: 'hero' (one photo + text), 'grid2', 'grid3', 'grid4', 'letter'.
const PANELS = {
  camp: {
    title: 'Base Camp',
    icon: 'icon_backpack',
    tabs: [{
      label: 'Where it started',
      pages: [
        {
          layout: 'hero',
          photos: ['section1_01.jpg'],
          text: "Hi, I'm Hà, a student from Hanoi. My journey began in my grandmother's " +
                'small garden, where I spent hours playing with soil as a child. As I grew up, ' +
                'I began spending that time pulling weeds and talking with my grandmother about ' +
                'her gardening experience. It was where everything started.',
        },
        { layout: 'grid2', photos: ['section1_02.jpg', 'section1_03.jpg'] },
      ],
    }],
  },

  valley: {
    title: 'Valley',
    icon: 'icon_book',
    tabs: [
      {
        label: 'Plant Journal',
        icon: 'icon_book',
        pages: [
          {
            layout: 'hero',
            photos: ['journal_01.jpg'],
            text: 'Sketching plants helps me slow down and truly see the details. ' +
                  "It's how I fell in love with the natural world.",
          },
          { layout: 'grid2', photos: ['journal_02.jpg', 'journal_03.jpg'] },
        ],
      },
      {
        label: 'TikTok Project',
        icon: 'icon_camera',
        pages: [
          {
            layout: 'hero',
            photos: ['tiktok_01.jpg'],
            text: 'I also made short TikTok videos to share simple recycling ideas that people ' +
                  'could easily try at home. I hoped they would encourage more young people to ' +
                  'reuse old materials instead of throwing them away.',
          },
          { layout: 'grid2', photos: ['tiktok_02.jpg', 'tiktok_03.jpg'] },
        ],
      },
    ],
  },

  cucphuong: {
    title: 'Cúc Phương Volunteering',
    icon: 'icon_banner',
    tabs: [{
      label: 'Cúc Phương',
      pages: [
        {
          layout: 'hero',
          photos: ['cucphuong_01.jpg'],
          text: 'At Cúc Phương, I had the chance to see endangered animals up close. ' +
                'This experience changed my view of conservation: it is not only about protecting ' +
                'wildlife, but also about helping people understand and connect with it.',
        },
        { layout: 'grid3', photos: ['cucphuong_02.jpg', 'cucphuong_03.jpg', 'cucphuong_04.jpg'] },
      ],
    }],
  },

  bachkhoa: {
    title: 'Bách Khoa Internship',
    icon: 'icon_tubes',
    tabs: [{
      label: 'Bách Khoa',
      pages: [
        {
          layout: 'hero',
          photos: ['bachkhoa_01.jpg'],
          text: 'During my internship at Bách Khoa, I brought my interest in nature into the ' +
                'laboratory. It helped me better understand how nature works at a deeper level.',
        },
        { layout: 'grid2', photos: ['bachkhoa_02.jpg', 'bachkhoa_03.jpg'] },
      ],
    }],
  },

  summit: {
    title: 'Summit',
    icon: 'icon_lens',
    finish: 'Finish the hike',
    tabs: [{
      label: 'A letter',
      pages: [{
        layout: 'letter',
        heading: 'The Summit.',
        text: [
          "I'm still not sure where this trail will take me.",
          'But every step has given me new questions, new places to explore, ' +
          'and more reasons to care for the living world.',
          "So, this isn't really the summit — just a place to see where I might go **next**.",
        ],
      }],
    }],
  },
};
