#![cfg(all(any(windows, target_os = "macos"), feature = "a11y-bench"))]

#[test]
#[ignore = "requires interactive desktop; run with --ignored --nocapture"]
fn a11y_bench_fixtures() {
    let summaries = actuate_lib::a11y_bench::run_all();
    #[cfg(windows)]
    let required_fixture = "notepad";
    #[cfg(target_os = "macos")]
    let required_fixture = "textedit";
    assert!(
        summaries
            .iter()
            .any(|s| s.fixture == required_fixture && s.samples.iter().any(|x| x.ok)),
        "expected at least one successful {required_fixture} sample"
    );
    assert!(
        summaries
            .iter()
            .any(|s| s.tool == "timeout_recovery" && s.samples.iter().all(|x| x.ok)),
        "expected timeout recovery samples to succeed (no queue poison)"
    );
}
