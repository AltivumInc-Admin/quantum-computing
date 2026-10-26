# shellcheck shell=bash
# Sourced, never executed. Pins the AWS account the calling script acts on, and
# proves it, before the script does anything else.
#
# WHY. The ambient credential chain on the founder's machine is never a Quantum
# Learner account: interactive shells export AWS_PROFILE for an unrelated
# account, and without it the chain falls back to Altivum's [default], a
# different org. A script that lets the chain choose acts on whatever account
# the shell happens to carry. This takes that choice away from the shell. The
# Node twin is scripts/lib/aws-target.mjs.
#
#   ql_aws_target [--default-profile <profile>] [--account-name <NAME>] || exit 1
#
# Profile  QL_AWS_PROFILE, else --default-profile, else REFUSE. AWS_PROFILE is
#          never read. The result is exported as AWS_PROFILE for the rest of the
#          calling script, so every later `aws` call inherits it.
# Account  read through the same credential chain those calls will use. No id
#          is committed here (this repo is public).
#            --account-name  the organization, read through QL_ORG_PROFILE
#                            (default org-admin), says which id NAME is, and a
#                            mismatch is a refusal. Value-blind: no id printed.
#            otherwise       no home account, so QL_AWS_PROFILE must be named.
#                            QL_EXPECT_ACCOUNT, exported from your own shell and
#                            never committed, is optional: set, it is asserted
#                            and a mismatch is a refusal; unset, the account the
#                            profile reached is printed, marked unverified.
#          No usable credentials, an expired SSO session included, is a refusal.
ql_aws_target() {
  local default_profile="" account_name="" org_profile="${QL_ORG_PROFILE:-org-admin}"
  while [ $# -gt 0 ]; do
    case "$1" in
      --default-profile) default_profile="${2:-}"; shift 2 ;;
      --account-name) account_name="${2:-}"; shift 2 ;;
      *) echo "ql_aws_target: unknown argument '$1'" >&2; return 2 ;;
    esac
  done

  local profile="${QL_AWS_PROFILE:-$default_profile}"
  if [ -z "$profile" ]; then
    cat >&2 <<EOF
REFUSING: no AWS profile named for this script, and it never uses the shell's
          AWS_PROFILE (that names whatever account the shell carries). Say
          which profile you mean:
            QL_AWS_PROFILE=<profile> $0
          Add QL_EXPECT_ACCOUNT=<12-digit account id> to also refuse a profile
          that reaches any other account. Nothing was changed.
EOF
    return 1
  fi
  export AWS_PROFILE="$profile"

  local scrub='s/[0-9]{12}/<account id>/g' expected actual err
  err="$(mktemp)"
  if [ -n "$account_name" ]; then
    if ! expected="$(aws --profile "$org_profile" organizations list-accounts \
          --query "Accounts[?Name=='$account_name'].Id" --output text 2>"$err")"; then
      echo "REFUSING: could not read the organization through profile '$org_profile', so" >&2
      echo "          this run cannot prove which account it is about. Nothing was changed." >&2
      sed -E "$scrub" "$err" | grep -m1 . >&2 || true
      echo "          Usually the SSO session has expired: aws sso login --profile $org_profile" >&2
      rm -f "$err"
      return 1
    fi
    if ! printf '%s' "$expected" | grep -qE '^[0-9]{12}$'; then
      echo "REFUSING: the organization does not list exactly one account named \"$account_name\"." >&2
      echo "          Nothing was changed." >&2
      rm -f "$err"
      return 1
    fi
  else
    expected="${QL_EXPECT_ACCOUNT:-}"
    if [ -n "$expected" ] && ! printf '%s' "$expected" | grep -qE '^[0-9]{12}$'; then
      cat >&2 <<EOF
REFUSING: QL_EXPECT_ACCOUNT is set but is not a 12-digit account id. Export the
          id of the account you mean (from your own shell, never committed),
          or unset it to run against whatever account '$profile' reaches,
          unverified. Nothing was changed.
EOF
      rm -f "$err"
      return 1
    fi
  fi

  if ! actual="$(aws sts get-caller-identity --query Account --output text 2>"$err")"; then
    echo "REFUSING: profile '$profile' produced no usable credentials. Nothing was changed." >&2
    sed -E "$scrub" "$err" | grep -m1 . >&2 || true
    rm -f "$err"
    return 1
  fi
  rm -f "$err"
  if [ -z "$expected" ]; then
    if ! printf '%s' "$actual" | grep -qE '^[0-9]{12}$'; then
      echo "REFUSING: profile '$profile' did not report an account id. Nothing was changed." >&2
      return 1
    fi
    echo "account: $actual (unverified; set QL_EXPECT_ACCOUNT to assert it)"
    return 0
  fi
  if [ "$actual" != "$expected" ]; then
    echo "REFUSING: profile '$profile' answers for a different account than ${account_name:-QL_EXPECT_ACCOUNT}." >&2
    echo "          Nothing was changed. Set QL_AWS_PROFILE to a profile that reaches it." >&2
    return 1
  fi
  echo "account: ${account_name:-the QL_EXPECT_ACCOUNT account} verified (profile '$profile')"
}
