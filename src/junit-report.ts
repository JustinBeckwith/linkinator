import {LinkResult, LinkState} from './index.js';

type Result = {
  links: LinkResult[];
  passed: boolean;
};
export function createReport(result: Result): string {
  const id = Math.floor(Date.now() / 1000);
  const failureCount = result.links.filter(
    link => link.state !== LinkState.OK
  ).length;
  const allCount = result.links.length;
  let testCases = '';
  result.links.forEach(link => {
    switch (link.state) {
      case LinkState.BROKEN:
        testCases += `<testcase name="Link ${link.url} on ${link.parent} is not correct (${link.status})." time="0" >
                    <failure message="${link.failureDetails}"></failure>
            </testcase>`;
        break;
      case LinkState.SKIPPED:
        testCases += `<testcase name="Link ${link.url} on ${link.parent} is skipped." time="0" >
                <skipped />
            </testcase>`;
        break;
      default:
        testCases += `<testcase name="Link ${link.url} on ${link.parent} is ok." time="0" />`;
        break;
    }
  });
  return `<?xml version="1.0" encoding="UTF-8"?> 
<testsuites>
        <testsuite id="${id}" name="Link results" failures="0" skipped="${
    allCount - failureCount
  }" tests="${allCount}" errors="${failureCount}">
            ${testCases}
    </testsuite>
 </testsuites>`;
}
