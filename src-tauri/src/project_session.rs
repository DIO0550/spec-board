//! 現在開いているプロジェクトのdomain stateをcoherentに保持するaggregate。

pub mod aggregate;
pub(crate) mod conflict_recovery;
pub mod revision;
pub mod session_id;

pub use aggregate::{
    PreparedProjectSession, ProjectSession, ProjectSessionCommitError, ProjectSessionSnapshot,
    ProjectSessionStateError, ProjectState, SessionCommit, SessionConflict, SessionIdentity,
    SessionVersion,
};
pub use revision::{RevisionExhausted, SessionRevision};
pub use session_id::{SessionId, SessionIdExhausted};
