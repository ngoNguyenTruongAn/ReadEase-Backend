const { AppDataSource } = require('../../../database/data-source');

const passages = [
  {
    title: 'The Helpful Rabbit',
    body: 'A small rabbit found a basket of apples near the river trail. She carried the basket to each neighbor and shared a sweet apple with everyone she met that morning.',
    difficulty: 'EASY',
    age_group: '5-7',
  },
  {
    title: 'Rainy Day Window',
    body: 'Drops of rain tapped on the window while Minh drew a bright rainbow in his notebook. He counted each color and smiled as the clouds slowly moved away.',
    difficulty: 'EASY',
    age_group: '5-7',
  },
  {
    title: 'Morning Garden',
    body: 'Lan watered the garden before school and noticed a ladybug resting on a leaf. She watched it crawl in circles, then fly toward the tall sunflower near the fence.',
    difficulty: 'EASY',
    age_group: '5-7',
  },
  {
    title: 'The Kite Race',
    body: 'Two friends ran across the field to see whose kite would rise first. A steady wind lifted both kites high, and they laughed when the tails danced together.',
    difficulty: 'EASY',
    age_group: '8-10',
  },
  {
    title: 'Library Adventure',
    body: 'At the library, Nam followed a map of colorful signs to find stories about oceans. He checked out one book about dolphins and promised to return next week.',
    difficulty: 'EASY',
    age_group: '8-10',
  },
  {
    title: 'Picnic at the Park',
    body: 'Grandmother packed rice cakes, oranges, and cold water for a picnic under a shady tree. The family played catch after lunch and watched birds glide over the lake.',
    difficulty: 'EASY',
    age_group: '8-10',
  },
  {
    title: 'Fox in the Forest',
    body: 'The little fox jumped over a mossy log and rushed through the quiet forest path. He stopped to listen to a stream before trotting back to his den.',
    difficulty: 'EASY',
    age_group: '11-13',
  },
  {
    title: 'Bridge Builder Club',
    body: 'During science club, students tested paper bridges with coins and recorded every result. They learned that folded shapes carried more weight than flat strips of paper alone.',
    difficulty: 'MEDIUM',
    age_group: '8-10',
  },
  {
    title: 'Market Morning',
    body: 'At dawn, vendors arranged vegetables by color and called out fresh prices to early shoppers. Mai compared tomatoes at three stalls before selecting the ripest basket for dinner.',
    difficulty: 'MEDIUM',
    age_group: '8-10',
  },
  {
    title: 'Team Practice',
    body: 'The school football team practiced passing drills in short, quick patterns to improve control. Their coach reminded everyone to communicate loudly so each movement stayed coordinated.',
    difficulty: 'MEDIUM',
    age_group: '8-10',
  },
  {
    title: 'Night Sky Notes',
    body: 'After sunset, Huy used a star chart to identify constellations above his rooftop. He wrote careful notes about brightness and shape, then compared them with a planetarium guide.',
    difficulty: 'MEDIUM',
    age_group: '11-13',
  },
  {
    title: 'Recycling Project',
    body: 'A class project asked students to track plastic use at home for one week. They presented charts showing reductions after switching to reusable bottles and cloth shopping bags.',
    difficulty: 'MEDIUM',
    age_group: '11-13',
  },
  {
    title: 'Mountain Trail',
    body: 'Our guide explained how weather can change quickly on mountain trails and why layered clothing matters. By noon, a cool wind arrived, proving her advice was practical and timely.',
    difficulty: 'MEDIUM',
    age_group: '11-13',
  },
  {
    title: 'Robotics Demo',
    body: 'At the fair, a student team programmed a small robot to sort colored blocks into separate bins. They adjusted sensor angles repeatedly until the machine made almost no mistakes.',
    difficulty: 'MEDIUM',
    age_group: '5-7',
  },
  {
    title: 'River Ecology',
    body: 'Researchers measured oxygen levels in a local river to understand fish population changes. Their report linked cleaner upstream waste practices with healthier habitats and more stable breeding seasons.',
    difficulty: 'HARD',
    age_group: '11-13',
  },
  {
    title: 'History Debate',
    body: 'Students analyzed two historical letters that described the same event from opposing viewpoints. The debate focused on source bias, audience intention, and which details remained consistent across accounts.',
    difficulty: 'HARD',
    age_group: '11-13',
  },
  {
    title: 'Energy Choices',
    body: 'A town council compared solar and wind proposals using cost forecasts and maintenance plans. Citizens asked how seasonal weather patterns could influence reliability, pricing, and long-term environmental impact.',
    difficulty: 'HARD',
    age_group: '11-13',
  },
  {
    title: 'Coral Reef Study',
    body: 'Marine biologists surveyed coral growth and bleaching events over several years using underwater imaging. Their findings suggested that local temperature spikes were strongly associated with reduced reef recovery.',
    difficulty: 'HARD',
    age_group: '8-10',
  },
  {
    title: 'City Transit Plan',
    body: 'Urban planners reviewed traffic data, commuter surveys, and route timing models before proposing a new transit map. The final draft aimed to shorten travel time without increasing operating costs.',
    difficulty: 'HARD',
    age_group: '8-10',
  },
  {
    title: 'Language Patterns',
    body: 'A linguistics workshop explored how prefixes and suffixes alter meaning across related words. Participants tested hypotheses by grouping terms into families and checking each pattern against dictionary examples.',
    difficulty: 'HARD',
    age_group: '5-7',
  },
];

const getWordCount = (body) => body.trim().split(/\s+/).length;

async function seedReadingContent() {
  await AppDataSource.initialize();

  try {
    const existingRows = await AppDataSource.query(
      'SELECT COUNT(*)::int AS count FROM reading_content WHERE deleted_at IS NULL',
    );

    if (existingRows[0].count >= 20) {
      console.log('Skipping seed: reading_content already contains at least 20 active rows.');
      return;
    }

    for (const passage of passages) {
      await AppDataSource.query(
        `
					INSERT INTO reading_content (title, body, difficulty, age_group, word_count, created_at, updated_at)
					VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
				`,
        [
          passage.title,
          passage.body,
          passage.difficulty,
          passage.age_group,
          getWordCount(passage.body),
        ],
      );
    }

    console.log('Seed complete: inserted 20 reading_content passages.');
  } finally {
    await AppDataSource.destroy();
  }
}

seedReadingContent().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
