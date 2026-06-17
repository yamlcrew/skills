# Worked examples — before / after

Each example shows the over-engineered version an unconstrained agent tends to
write, then the lazy version. The deliberate simplification is marked with an
`lsd:` comment naming the ceiling and the upgrade path.

---

## Date picker

**Task:** "Add a date picker to this form."

### Over-engineered

```bash
npm install flatpickr
```

```jsx
import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.min.css";
import { useEffect, useRef } from "react";

export default function DatePicker({ value, onChange, minDate, maxDate }) {
  const inputRef = useRef(null);
  const instanceRef = useRef(null);

  useEffect(() => {
    instanceRef.current = flatpickr(inputRef.current, {
      defaultDate: value, minDate, maxDate, dateFormat: "Y-m-d",
      onChange: ([date]) => onChange(date),
    });
    return () => instanceRef.current?.destroy();
  }, []);

  useEffect(() => { instanceRef.current?.setDate(value, false); }, [value]);

  return <input ref={inputRef} className="date-picker" />;
}
```

One dependency, a wrapper component, two `useEffect` hooks, a cleanup function,
and a CSS import — to pick a date.

### Lazy

```html
<!-- lsd: browser has one -->
<input type="date">
```

**1 dependency + 30 lines → 0 dependencies + 1 line.** Native, accessible,
localized, keyboard-navigable, mobile-friendly. The browser team already did the
work.

---

## Sorting

**Task:** "Sort this array of numbers."

### Over-engineered

```js
function quickSort(arr, compareFn = (a, b) => a - b) {
  if (arr.length <= 1) return arr;
  const pivot = arr[Math.floor(arr.length / 2)];
  const left = [], right = [], equal = [];
  for (const item of arr) {
    const cmp = compareFn(item, pivot);
    if (cmp < 0) left.push(item);
    else if (cmp > 0) right.push(item);
    else equal.push(item);
  }
  return [...quickSort(left, compareFn), ...equal, ...quickSort(right, compareFn)];
}
const sorted = quickSort(numbers);
```

A hand-rolled quicksort. It allocates three arrays per recursion level, blows the
stack on large inputs, and replaces an engine-optimized native sort with homework.

### Lazy

```js
// lsd: this exists
numbers.sort((a, b) => a - b)
```

**24 lines → 1 line.** Every runtime ships a sort tuned by people whose whole job
is sorting. Use it.

---

## Email validation

**Task:** "Validate an email address in Python."

### Over-engineered

```python
import re

EMAIL_PATTERN = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')

class EmailValidator:
    """Validates email addresses against RFC-like rules."""
    def __init__(self, pattern: re.Pattern = EMAIL_PATTERN):
        self.pattern = pattern
    def validate(self, email: str) -> bool:
        if not isinstance(email, str):
            raise TypeError("email must be a string")
        email = email.strip()
        if not email:
            return False
        return bool(self.pattern.match(email))

def validate_email(email: str) -> bool:
    return EmailValidator().validate(email)
```

A class, a wrapper, and a regex that still rejects valid addresses and accepts
invalid ones. Regex cannot validate email. Only a delivery attempt can.

### Lazy

```python
# lsd: good enough, real validation is sending the mail
"@" in email and "." in email.split("@")[-1]
```

Or, if it must be thorough, the standard library has it:

```python
# lsd: stdlib covers this
from email.utils import parseaddr
"@" in parseaddr(email)[1]
```

**27 lines → 1 line.** The honest answer: let the confirmation email reject it.
That's what confirmation emails are for.

---

## Caching

**Task:** "We should cache these API responses."

### Over-engineered

A 120-line thread-safe `TTLCache` class: an `OrderedDict` store, a `threading.Lock`,
per-entry `CacheEntry` dataclass, max-size eviction, hit/miss counters, plus
invalidation, a stats endpoint, and unit tests for all of it — for a problem nobody
has measured yet.

### Lazy

First question: **do you actually need a cache?**

- **Unsure?** Ship without it. Add it when you measure the problem. (YAGNI)
- **Pure function, hot path?** The standard library has it:

  ```python
  # lsd: stdlib covers this
  from functools import lru_cache

  @lru_cache(maxsize=1000)
  def fetch(key): ...
  ```

- **Real distributed caching needs?** Use Redis / memcached / your platform's
  cache. Infrastructure problems get infrastructure, not a homemade class.

**120 lines → 0–3 lines.** The fastest cache is the one you didn't have to debug.

---

## API endpoint

**Task:** "Add an endpoint that returns a user by id."

### Over-engineered

Five files — `controllers/`, `services/`, `repositories/`, `schemas/`,
`exceptions/` — three classes, a custom `UserNotFoundError`, and a
dependency-injection chain, all wrapping one database call.

### Lazy

```python
# lsd: drop the layers; keep the response schema, it whitelists what leaves the API
class UserOut(BaseModel):
    id: int
    name: str
    email: str

@app.get("/users/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404)
    return user
```

**5 files → 9 lines.** The repository, service, and custom exception were ceremony.
The response schema was **not**: it whitelists which fields leave the API, so it
stays — returning the raw ORM model would leak every column. That is exactly the
line "when NOT to be lazy" draws: cut the layers, keep the trust boundary. Add a
service layer when a second caller shows up, if it ever does.

---

## Local UI state

**Task:** "Track whether this modal is open."

### Over-engineered

```bash
npm install @reduxjs/toolkit react-redux
```

```js
// store/modalSlice.js
const modalSlice = createSlice({
  name: "modal",
  initialState: { isOpen: false },
  reducers: {
    open: (s) => { s.isOpen = true; },
    close: (s) => { s.isOpen = false; },
  },
});
export const { open, close } = modalSlice.actions;
export default modalSlice.reducer;

// store/index.js
export const store = configureStore({ reducer: { modal: modalReducer } });

// + <Provider store={store}>, useSelector, useDispatch in the component
```

A global store, a slice, a provider, and two hooks — so one component can
remember a boolean about itself.

### Lazy

```jsx
// lsd: state nobody else reads stays local
const [isOpen, setOpen] = useState(false);
```

**A store + slice + provider → 1 line.** Reach for a global store when state is
genuinely shared across distant components — not for a flag one component owns.

---

## Retry on a flaky call

**Task:** "Retry this API call a few times if it fails."

### Over-engineered

A `CircuitBreaker` class with states (`CLOSED`/`OPEN`/`HALF_OPEN`), a failure
threshold, a reset timeout, a sliding window of recent results, and a decorator
to wrap calls — for a script that hits one endpoint.

### Lazy

If an installed library already does it, use it:

```python
# lsd: stdlib-grade dep covers this
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(stop=stop_after_attempt(3), wait=wait_exponential())
def fetch(): ...
```

No dependency, no appetite for one? Three lines:

```python
# lsd: fixed backoff, swap for a circuit breaker if a dependency keeps flapping
for attempt in range(3):
    try:
        return fetch()
    except TransientError:
        if attempt == 2:
            raise
        time.sleep(2 ** attempt)
```

**A stateful breaker class → 3 lines.** A circuit breaker earns its keep when a
shared dependency flaps under load and you must stop hammering it — name that
ceiling in the comment and add it when you hit it, not before.
