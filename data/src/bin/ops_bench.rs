// Operator latency benchmark.
//
// For each (dist, n, p, rep), builds:
//   A         — (dist, n, p,        seed_A)
//   B_similar — (dist, n, p,        seed_Bsim)   same density profile
//   B_small   — (dist, n, p * 0.01, seed_Bsmall) ~1% of A's density
// All three are optimized. Then each of 6 ops is timed on a fresh clone of A:
//   intersect_similar, intersect_small, union_similar, union_small,
//   diff_similar,      diff_small
// Timings are recorded in nanoseconds via std::time::Instant. The caller runs
// REPS reps with different seeds; median is taken in post-processing.
//
// Interpretation note: "small 1%" = p_small = p * 0.01. When p < 0.0001 this
// would round to 0, so p_small is floored at a single element when k_target
// would otherwise be zero but p > 0.

use roaring::RoaringBitmap;
use roaring_bench::{build_bitmap, dist_seed, parse_dist, Dist};
use std::hint::black_box;
use std::io::Write;
use std::time::Instant;

const REPS: u32 = 3;
const SMALL_FRAC: f64 = 0.01;

const UNIVERSE_SIZES: &[u64] = &[
    100_000,
    200_000,
    500_000,
    800_000,
    1_000_000,
    2_000_000,
    5_000_000,
    8_000_000,
    10_000_000,
    20_000_000,
    50_000_000,
    80_000_000,
    100_000_000,
    200_000_000,
    500_000_000,
    800_000_000,
    1_000_000_000,
];

const CARDINALITY_FRACTIONS: &[f64] = &[
    0.0001, 0.0002, 0.0005, 0.0008, 0.001, 0.002, 0.005, 0.008, 0.01, 0.02, 0.05, 0.08, 0.1, 0.2,
    0.5, 0.8, 1.0,
];

#[derive(Clone, Copy)]
enum Role {
    A,
    BSimilar,
    BSmall,
}

fn role_seed(role: Role) -> u64 {
    match role {
        Role::A => 0xA000_0000_0000_0000,
        Role::BSimilar => 0xB51A_0000_0000_0000,
        Role::BSmall => 0xB5A1_0000_0000_0000,
    }
}

fn seed_for(dist: Dist, n: u64, p: f64, rep: u32, role: Role) -> u64 {
    n.wrapping_mul(1_000_003)
        ^ (p.to_bits().wrapping_mul(2_654_435_761))
        ^ ((rep as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15))
        ^ dist_seed(dist)
        ^ role_seed(role)
}

fn make(dist: Dist, n: u64, p: f64, rep: u32, role: Role) -> RoaringBitmap {
    let seed = seed_for(dist, n, p, rep, role);
    let mut bm = build_bitmap(dist, n, p, seed);
    bm.optimize();
    bm
}

fn time_ns<F: FnOnce() -> R, R>(f: F) -> (u128, R) {
    let t0 = Instant::now();
    let r = black_box(f());
    let ns = t0.elapsed().as_nanos();
    (ns, r)
}

fn run_intersect(a: &RoaringBitmap, b: &RoaringBitmap) -> (u128, u64) {
    let mut work = a.clone();
    let (ns, ()) = time_ns(|| {
        work &= black_box(b);
    });
    (ns, work.len())
}

fn run_union(a: &RoaringBitmap, b: &RoaringBitmap) -> (u128, u64) {
    let mut work = a.clone();
    let (ns, ()) = time_ns(|| {
        work |= black_box(b);
    });
    (ns, work.len())
}

fn run_diff(a: &RoaringBitmap, b: &RoaringBitmap) -> (u128, u64) {
    let mut work = a.clone();
    let (ns, ()) = time_ns(|| {
        work -= black_box(b);
    });
    (ns, work.len())
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let dist = parse_dist(&args);
    let tag = dist.tag();

    let mut out = std::io::stdout().lock();
    writeln!(
        out,
        "{{\"type\":\"header\",\"distribution\":\"{}\",\"reps\":{},\"small_frac\":{},\"ops\":[\"intersect_similar\",\"intersect_small\",\"union_similar\",\"union_small\",\"diff_similar\",\"diff_small\"]}}",
        tag, REPS, SMALL_FRAC
    ).unwrap();
    out.flush().unwrap();

    for &n in UNIVERSE_SIZES {
        for &p in CARDINALITY_FRACTIONS {
            for rep in 0..REPS {
                let p_small = (p * SMALL_FRAC).max(0.0);

                let a = make(dist, n, p, rep, Role::A);
                let b_sim = make(dist, n, p, rep, Role::BSimilar);
                let b_sm = make(dist, n, p_small, rep, Role::BSmall);

                let k_a = a.len();
                let k_b_sim = b_sim.len();
                let k_b_sm = b_sm.len();

                let (ns_int_sim, k_int_sim) = run_intersect(&a, &b_sim);
                let (ns_int_sm, k_int_sm) = run_intersect(&a, &b_sm);
                let (ns_uni_sim, k_uni_sim) = run_union(&a, &b_sim);
                let (ns_uni_sm, k_uni_sm) = run_union(&a, &b_sm);
                let (ns_dif_sim, k_dif_sim) = run_diff(&a, &b_sim);
                let (ns_dif_sm, k_dif_sm) = run_diff(&a, &b_sm);

                writeln!(
                    out,
                    "{{\"type\":\"row\",\"distribution\":\"{}\",\"n\":{},\"p\":{},\"p_small\":{},\"rep\":{},\"k_a\":{},\"k_b_similar\":{},\"k_b_small\":{},\"ops\":{{\"intersect_similar\":{{\"ns\":{},\"k_out\":{}}},\"intersect_small\":{{\"ns\":{},\"k_out\":{}}},\"union_similar\":{{\"ns\":{},\"k_out\":{}}},\"union_small\":{{\"ns\":{},\"k_out\":{}}},\"diff_similar\":{{\"ns\":{},\"k_out\":{}}},\"diff_small\":{{\"ns\":{},\"k_out\":{}}}}}}}",
                    tag, n, p, p_small, rep,
                    k_a, k_b_sim, k_b_sm,
                    ns_int_sim, k_int_sim,
                    ns_int_sm,  k_int_sm,
                    ns_uni_sim, k_uni_sim,
                    ns_uni_sm,  k_uni_sm,
                    ns_dif_sim, k_dif_sim,
                    ns_dif_sm,  k_dif_sm,
                ).unwrap();
                out.flush().unwrap();

                eprintln!(
                    "[{}] n={:>10} p={:<8} rep={} kA={:>10} kBs={:>10} kBsm={:>10} | int_s={:>10}ns int_sm={:>10}ns | uni_s={:>10}ns uni_sm={:>10}ns | dif_s={:>10}ns dif_sm={:>10}ns",
                    tag, n, p, rep, k_a, k_b_sim, k_b_sm,
                    ns_int_sim, ns_int_sm, ns_uni_sim, ns_uni_sm, ns_dif_sim, ns_dif_sm
                );
            }
        }
    }
}
