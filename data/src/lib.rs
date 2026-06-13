use rand::Rng;
use rand::SeedableRng;
use rand_pcg::Pcg64Mcg;
use roaring::RoaringBitmap;
use std::collections::HashSet;

#[derive(Clone, Copy, Debug)]
pub enum Dist {
    Uniform,
    Block { c: u64 },
    Zipf { s: f64 },
}

impl Dist {
    pub fn tag(self) -> String {
        match self {
            Dist::Uniform => "uniform".into(),
            Dist::Block { c } => format!("blockC{}", c),
            Dist::Zipf { s } => format!("zipf_s{}", s),
        }
    }
}

pub fn parse_dist(args: &[String]) -> Dist {
    let name = args.get(1).map(|s| s.as_str()).unwrap_or("uniform");
    match name {
        "uniform" => Dist::Uniform,
        "block" => {
            let c: u64 = args
                .get(2)
                .expect("usage: block <C>")
                .parse()
                .expect("C must be a positive integer");
            Dist::Block { c }
        }
        "zipf" => {
            let s: f64 = args
                .get(2)
                .expect("usage: zipf <s>")
                .parse()
                .expect("s must be a float");
            Dist::Zipf { s }
        }
        other => panic!("unknown distribution: {other}"),
    }
}

pub fn dist_seed(dist: Dist) -> u64 {
    match dist {
        Dist::Uniform => 0x0000_0000_0000_0000,
        Dist::Block { c } => 0xB10C_0000_0000_0000 ^ c,
        Dist::Zipf { s } => 0x21F0_0000_0000_0000 ^ s.to_bits(),
    }
}

pub fn build_bitmap(dist: Dist, n: u64, p: f64, seed: u64) -> RoaringBitmap {
    let mut bm = RoaringBitmap::new();
    assert!(n <= u32::MAX as u64 + 1, "universe too large for u32 roaring bitmap");
    if p >= 1.0 {
        if n > 0 {
            bm.insert_range(0..(n as u32));
        }
        return bm;
    }
    if p <= 0.0 || n == 0 {
        return bm;
    }
    match dist {
        Dist::Uniform => fill_uniform(&mut bm, n, p, seed),
        Dist::Block { c } => fill_block(&mut bm, n, p, c, seed),
        Dist::Zipf { s } => fill_zipf(&mut bm, n, p, s, seed),
    }
    bm
}

fn fill_uniform(bm: &mut RoaringBitmap, n: u64, p: f64, seed: u64) {
    let mut rng = Pcg64Mcg::seed_from_u64(seed);
    let log_one_minus_p = (1.0_f64 - p).ln();
    let mut i: i64 = -1;
    loop {
        let u: f64 = rng.gen_range(f64::MIN_POSITIVE..1.0);
        let gap = (u.ln() / log_one_minus_p).floor() as i64 + 1;
        i += gap;
        if i < 0 || (i as u64) >= n {
            break;
        }
        bm.insert(i as u32);
    }
}

fn fill_block(bm: &mut RoaringBitmap, n: u64, p: f64, c: u64, seed: u64) {
    let c = c.max(1).min(n);
    let k_target = (n as f64 * p).round() as u64;
    if k_target == 0 {
        return;
    }
    let num_buckets = n / c;
    if num_buckets == 0 {
        bm.insert_range(0..(n.min(k_target) as u32));
        return;
    }
    let num_clusters = ((k_target + c / 2) / c).clamp(1, num_buckets);

    let mut rng = Pcg64Mcg::seed_from_u64(seed);

    let insert_bucket = |bm: &mut RoaringBitmap, bucket: u64| {
        let start = bucket * c;
        let end = ((bucket + 1) * c).min(n);
        bm.insert_range((start as u32)..(end as u32));
    };

    if num_clusters * 2 <= num_buckets {
        let chosen = floyd_sample(&mut rng, num_buckets, num_clusters);
        for bucket in chosen {
            insert_bucket(bm, bucket);
        }
    } else {
        let covered_end = (num_buckets * c).min(n);
        bm.insert_range(0..(covered_end as u32));
        let excluded_count = num_buckets - num_clusters;
        let excluded = floyd_sample(&mut rng, num_buckets, excluded_count);
        for bucket in excluded {
            let start = bucket * c;
            let end = ((bucket + 1) * c).min(n);
            bm.remove_range((start as u32)..(end as u32));
        }
    }
}

fn fill_zipf(bm: &mut RoaringBitmap, n: u64, p: f64, s: f64, seed: u64) {
    let k_target = (n as f64 * p).round() as u64;
    if k_target == 0 {
        return;
    }
    let m = ((k_target as f64).sqrt().floor() as u64).max(10).min(k_target);

    let weights: Vec<f64> = (1..=m).map(|i| 1.0 / (i as f64).powf(s)).collect();
    let total_w: f64 = weights.iter().sum();
    let mut sizes: Vec<u64> = weights
        .iter()
        .map(|w| ((w / total_w) * k_target as f64).round() as u64)
        .collect();

    let sum_actual: i128 = sizes.iter().map(|&x| x as i128).sum();
    let diff = k_target as i128 - sum_actual;
    if diff != 0 {
        let head = sizes[0] as i128 + diff;
        sizes[0] = head.max(0) as u64;
    }

    let mut rng = Pcg64Mcg::seed_from_u64(seed);
    for size in sizes {
        if size == 0 {
            continue;
        }
        let size = size.min(n);
        let max_start = n - size;
        let start = if max_start == 0 {
            0
        } else {
            rng.gen_range(0..=max_start)
        };
        let end = start + size;
        bm.insert_range((start as u32)..(end as u32));
    }
}

fn floyd_sample(rng: &mut impl Rng, n: u64, k: u64) -> HashSet<u64> {
    let mut out: HashSet<u64> = HashSet::with_capacity(k as usize);
    if k == 0 || n == 0 {
        return out;
    }
    let k = k.min(n);
    for j in (n - k)..n {
        let t = rng.gen_range(0..=j);
        if !out.insert(t) {
            out.insert(j);
        }
    }
    out
}

// -----------------------------------------------------------------------------
// Sorted-stream producers for each distribution.
//
// Emits strictly-ascending, deduplicated u32 values for direct consumption by
// builders that require sorted, duplicate-free input (used by the lookup
// benchmark). The output set is produced without any intermediate
// RoaringBitmap.
//
// Shape differences vs. the Roaring fillers:
//
//   - Uniform: identical algorithm (geometric-gap skip sampling), values
//     are already ascending.
//   - Block:   identical bucket-sampling, but the chosen bucket indices
//     are sorted ascending before emission so whole buckets stream out
//     in order.
//   - Zipf:    cluster sizes are still 1/i^s weighted, but clusters are
//     laid out left-to-right with uniform-random gaps instead of being
//     placed at uniform-random starts. Eliminates overlaps (the prior
//     design tolerated a handful at very high p) so actual cardinality
//     equals k_target, and the stream is naturally ascending.
// -----------------------------------------------------------------------------

pub fn stream_ascending<F: FnMut(u32)>(dist: Dist, n: u64, p: f64, seed: u64, mut emit: F) -> u64 {
    assert!(n <= u32::MAX as u64 + 1, "universe too large for u32");
    if n == 0 {
        return 0;
    }
    if p >= 1.0 {
        for i in 0..(n as u32) {
            emit(i);
        }
        return n;
    }
    if p <= 0.0 {
        return 0;
    }
    match dist {
        Dist::Uniform => stream_uniform(n, p, seed, &mut emit),
        Dist::Block { c } => stream_block(n, p, c, seed, &mut emit),
        Dist::Zipf { s } => stream_zipf(n, p, s, seed, &mut emit),
    }
}

fn stream_uniform(n: u64, p: f64, seed: u64, emit: &mut dyn FnMut(u32)) -> u64 {
    let mut rng = Pcg64Mcg::seed_from_u64(seed);
    let log_one_minus_p = (1.0_f64 - p).ln();
    let mut i: i64 = -1;
    let mut count = 0;
    loop {
        let u: f64 = rng.gen_range(f64::MIN_POSITIVE..1.0);
        let gap = (u.ln() / log_one_minus_p).floor() as i64 + 1;
        i += gap;
        if i < 0 || (i as u64) >= n {
            break;
        }
        emit(i as u32);
        count += 1;
    }
    count
}

fn stream_block(n: u64, p: f64, c: u64, seed: u64, emit: &mut dyn FnMut(u32)) -> u64 {
    let c = c.max(1).min(n);
    let k_target = (n as f64 * p).round() as u64;
    if k_target == 0 {
        return 0;
    }
    let num_buckets = n / c;
    if num_buckets == 0 {
        let take = n.min(k_target);
        for i in 0..(take as u32) {
            emit(i);
        }
        return take;
    }
    let num_clusters = ((k_target + c / 2) / c).clamp(1, num_buckets);
    let mut rng = Pcg64Mcg::seed_from_u64(seed);

    let mut chosen: Vec<u64> = floyd_sample(&mut rng, num_buckets, num_clusters)
        .into_iter()
        .collect();
    chosen.sort_unstable();

    let mut count = 0;
    for bucket in chosen {
        let start = bucket * c;
        let end = ((bucket + 1) * c).min(n);
        for v in (start as u32)..(end as u32) {
            emit(v);
        }
        count += end - start;
    }
    count
}

fn stream_zipf(n: u64, p: f64, s: f64, seed: u64, emit: &mut dyn FnMut(u32)) -> u64 {
    let k_target = (n as f64 * p).round() as u64;
    if k_target == 0 {
        return 0;
    }
    let m = ((k_target as f64).sqrt().floor() as u64).max(10).min(k_target);

    let weights: Vec<f64> = (1..=m).map(|i| 1.0 / (i as f64).powf(s)).collect();
    let total_w: f64 = weights.iter().sum();
    let mut sizes: Vec<u64> = weights
        .iter()
        .map(|w| ((w / total_w) * k_target as f64).round() as u64)
        .collect();

    // Reconcile rounding drift into the largest cluster, then clip so that
    // Σ sizes ≤ n (leaves room for ≥0-length gaps between clusters).
    let sum_actual: i128 = sizes.iter().map(|&x| x as i128).sum();
    let diff = k_target as i128 - sum_actual;
    if diff != 0 {
        let head = sizes[0] as i128 + diff;
        sizes[0] = head.max(0) as u64;
    }
    let total_size: u64 = sizes.iter().sum();
    let total_size = total_size.min(n);
    let mut remaining_budget = total_size;
    // Cap the largest cluster if any single cluster alone exceeds n.
    for sz in sizes.iter_mut() {
        if *sz > remaining_budget {
            *sz = remaining_budget;
        }
        remaining_budget = remaining_budget.saturating_sub(*sz);
    }

    let mut rng = Pcg64Mcg::seed_from_u64(seed);

    // Shuffle cluster order so the head-heavy weights aren't always first.
    // Fisher-Yates.
    for i in (1..sizes.len()).rev() {
        let j = rng.gen_range(0..=i);
        sizes.swap(i, j);
    }
    sizes.retain(|&x| x > 0);

    // Distribute the remaining free space (n - Σ sizes) into (sizes.len() + 1)
    // gap slots using a bars-and-stars draw. The `+1` slot is the leading gap
    // before the first cluster.
    let free = n.saturating_sub(sizes.iter().sum::<u64>());
    let num_gaps = sizes.len() as u64 + 1;
    let gaps = bars_and_stars(&mut rng, free, num_gaps);

    let mut cursor: u64 = 0;
    let mut count: u64 = 0;
    for (i, sz) in sizes.iter().enumerate() {
        cursor += gaps[i];
        let start = cursor;
        let end = cursor + *sz;
        debug_assert!(end <= n, "zipf stream exceeded universe");
        for v in (start as u32)..(end as u32) {
            emit(v);
        }
        count += *sz;
        cursor = end;
    }
    count
}

// Draw `num_gaps` non-negative integers summing to `free`, uniformly over
// the compositions of `free` into `num_gaps` parts. Uses the bars-and-stars
// reduction: pick `num_gaps - 1` sorted cut points in [0, free] and diff.
// Runs in O(num_gaps log num_gaps) — cheap relative to cluster emission.
fn bars_and_stars(rng: &mut impl Rng, free: u64, num_gaps: u64) -> Vec<u64> {
    if num_gaps == 0 {
        return Vec::new();
    }
    if free == 0 {
        return vec![0; num_gaps as usize];
    }
    let cuts = (num_gaps as usize).saturating_sub(1);
    let mut points: Vec<u64> = (0..cuts).map(|_| rng.gen_range(0..=free)).collect();
    points.sort_unstable();
    let mut out = Vec::with_capacity(num_gaps as usize);
    let mut prev: u64 = 0;
    for &p in &points {
        out.push(p - prev);
        prev = p;
    }
    out.push(free - prev);
    out
}
